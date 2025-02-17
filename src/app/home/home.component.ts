import { Component, NgZone } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { UploadFile } from 'ngx-uploader';
import {
    ERROR,
    PLAYLIST_PARSE,
    PLAYLIST_PARSE_BY_URL,
    PLAYLIST_PARSE_RESPONSE,
    PLAYLIST_UPDATE_RESPONSE,
} from '../../../shared/ipc-commands';
import { Playlist } from '../../../shared/playlist.interface';
import { DataService } from '../services/data.service';
import { ChannelStore } from '../state';

/** Type to describe meta data of a playlist */
export type PlaylistMeta = Pick<
    Playlist,
    | 'count'
    | 'title'
    | 'filename'
    | '_id'
    | 'url'
    | 'importDate'
    | 'userAgent'
    | 'filePath'
    | 'updateDate'
    | 'updateState'
    | 'position'
>;

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.scss'],
})
export class HomeComponent {
    /** Added playlists */
    playlists: PlaylistMeta[] = [];

    /** Loading spinner state */
    isLoading = false;

    /** IPC Renderer commands list with callbacks */
    commandsList = [
        {
            id: PLAYLIST_PARSE_RESPONSE,
            execute: (response: { payload: Playlist }): void => {
                this.channelStore.setPlaylist(response.payload);
                this.navigateToPlayer();
            },
        },
        {
            id: ERROR,
            execute: (response: { message: string; status: number }): void => {
                this.isLoading = false;
                this.showNotification(
                    `Error: ${response.status} ${response.message}.`
                );
            },
        },
        {
            id: PLAYLIST_UPDATE_RESPONSE,
            execute: (response: { message: string }): void =>
                this.showNotification(response.message),
        },
    ];

    /**
     * Creates an instanceof HomeComponent
     * @param channelStore channels store
     * @param electronService electron service
     * @param ngZone angular ngZone module
     * @param router angular router
     * @param snackBar snackbar for notification messages
     */
    constructor(
        private electronService: DataService,
        private ngZone: NgZone,
        private channelStore: ChannelStore,
        private router: Router,
        private snackBar: MatSnackBar
    ) {
        // set all renderer listeners
        this.setRendererListeners();
    }

    /**
     * Set electrons main process listeners
     */
    setRendererListeners(): void {
        this.commandsList.forEach((command) => {
            if (this.electronService.isElectron) {
                this.electronService.listenOn(command.id, (event, response) =>
                    this.ngZone.run(() => command.execute(response))
                );
            } else {
                this.electronService.listenOn(command.id, (response) => {
                    if (response.data.type === command.id) {
                        command.execute(response.data);
                    }
                });
            }
        });
    }

    /**
     * Shows the filename of rejected file
     * @param fileName name of the uploaded file
     */
    rejectFile(fileName: string): void {
        this.showNotification(
            `File was rejected, unsupported file format (${fileName}).`
        );
        this.isLoading = false;
    }

    /**
     * Parse and store uploaded playlist
     * @param payload
     */
    handlePlaylist(payload: { uploadEvent: Event; file: UploadFile }): void {
        this.isLoading = true;
        const result = (payload.uploadEvent.target as FileReader).result;
        const array = (result as string).split('\n');
        this.electronService.sendIpcEvent(PLAYLIST_PARSE, {
            title: payload.file.name,
            playlist: array,
            path: (payload.file.nativeFile as any).path,
        });
    }

    /**
     * Navigates to the video player route
     */
    navigateToPlayer(): void {
        this.isLoading = false;
        this.router.navigateByUrl('/iptv', { skipLocationChange: true });
    }

    /**
     * Sends url of the playlist to the renderer process
     * @param playlistUrl url of the added playlist
     */
    sendPlaylistsUrl(playlistUrl: string): void {
        this.isLoading = true;
        this.electronService.sendIpcEvent(PLAYLIST_PARSE_BY_URL, {
            title: this.getLastUrlSegment(playlistUrl),
            url: playlistUrl,
        });
    }

    /**
     * Returns last segment (part after last slash "/") of the given URL
     * @param value URL as string
     */
    getLastUrlSegment(value: string): string {
        if (value && value.length > 1) {
            return value.substr(value.lastIndexOf('/') + 1);
        } else {
            return '';
        }
    }

    /**
     * Shows snack bar notification with a given message
     * @param message message to show
     * @param duration visibility duration of the snackbar
     */
    showNotification(message: string, duration = 2000): void {
        this.snackBar.open(message, null, {
            duration,
        });
    }

    /**
     * Remove ipcRenderer listeners after component destroy
     */
    ngOnDestroy(): void {
        this.commandsList.forEach((command) =>
            this.electronService.removeAllListeners(command.id)
        );
    }
}
