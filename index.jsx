import YouTube from 'react-youtube'

module.exports = (Plugin, Library) => {
    'use strict';

    const {Patcher, Logger, DiscordModules, WebpackModules} = Library;
    const {React, Dispatcher, SelectedChannelStore, MessageStore, ChannelStore, SelectedGuildStore, ButtonData} = DiscordModules;

    const Embed = BdApi.findModuleByProps('EmbedVideo');
    const PiPWindow = WebpackModules.find(m => m.PictureInPictureWindow?.displayName === "PictureInPictureWindow");
    const Transitions = BdApi.findModuleByProps("transitionTo");
    const VideoPlayPill = BdApi.findModuleByDisplayName("VideoPlayPill");
    const Video = BdApi.findModuleByDisplayName("MediaPlayer");

    const embedRegistry = new Map();
    const pipRegistry = new Map();

    function registerYouTubePiP(videoId, volume, currentTime, messageId, channelId, guildId) {
        Logger.log(videoId)
        Logger.log(currentTime)
        Logger.log(messageId)
        Logger.log(channelId)
        const id = `E${guildId}:${channelId}:${messageId}`;
        pipRegistry.set(id, {
            videoId: videoId,
            currentTime: currentTime,
            volume: volume
        });

        // channel.name = id;

        Dispatcher.dirtyDispatch({
            type: 'PICTURE_IN_PICTURE_OPEN',
            component: 'VIDEO',
            id: id,
            props: {
                channel: ChannelStore.getChannel(channelId)
            }
        });
    }

    function hasPip(messageId, channelId, guildId) {
        return pipRegistry.has(`E${guildId}:${channelId}:${messageId}`)
    }

    function captureYouTubePiP(messageId, channelId, guildId, videoId) {
        const id = `E${guildId}:${channelId}:${messageId}`;
        if (!pipRegistry.has(id)) {
            return null;
        }

        // Request that all PiP players update the current time of respective videos in preparation for possible capture
        Dispatcher.dirtyDispatch({type: 'PIP_SHOULD_UPDATE_CURRENT_TIME'});

        const val = pipRegistry.get(id);
        if (videoId !== val.videoId) {
            return null;
        }
        pipRegistry.delete(id);

        Dispatcher.dirtyDispatch({
            type: 'PICTURE_IN_PICTURE_CLOSE',
            id: id
        });

        return val;
    }

    let lastStartedVideo = null;

    /*function PiPWindowSelector(names, selectedIndex, onIndexChange) {
        return (

        );
    }*/

    function EmbedCapturePrompt(props) {
        return <div className='embedFrame'>
            <div className='absoluteCenter verticalAlign'>
                <svg height="48" width="48" style={{fill: "var(--blurple)"}}><path d="M22.3 25.85H39.05V13H22.3ZM7 40Q5.8 40 4.9 39.1Q4 38.2 4 37V11Q4 9.8 4.9 8.9Q5.8 8 7 8H41Q42.25 8 43.125 8.9Q44 9.8 44 11V37Q44 38.2 43.125 39.1Q42.25 40 41 40ZM7 37Q7 37 7 37Q7 37 7 37V11Q7 11 7 11Q7 11 7 11Q7 11 7 11Q7 11 7 11V37Q7 37 7 37Q7 37 7 37ZM7 37H41Q41 37 41 37Q41 37 41 37V11Q41 11 41 11Q41 11 41 11H7Q7 11 7 11Q7 11 7 11V37Q7 37 7 37Q7 37 7 37ZM25.3 22.85V16H36.05V22.85Z"/></svg>
                <span style={{'font-weight': 'bold', 'margin-bottom': '10px'}}>Currently in PiP Mode</span>
                {React.createElement(ButtonData.default, {
                    onClick: props.onCaptureRequest
                }, ['Exit PiP'])}
            </div>
        </div>
    }

    class YouTubeFrame extends React.Component {
        constructor(props) {
            super(props);

            this.embedId = props.embedId;

            let data = props.data;

            this.videoId = data.videoId;
            let currentTime = data.currentTime;
            let volume = data.volume ?? 100;

            this.onPlayerReady = this.onPlayerReady.bind(this);
            this.onPlayerError = this.onPlayerError.bind(this);
            this.onPlayerState = this.onPlayerState.bind(this);
            this.coverClick = this.coverClick.bind(this);
            this.onChannelSelect = this.onChannelSelect.bind(this);
            this.onEmbedId = this.onEmbedId.bind(this);
            this.onCloseClick = this.onCloseClick.bind(this);
            this.onDoubleClick = this.onDoubleClick.bind(this);
            this.onPipClose = this.onPipClose.bind(this);
            this.shouldUpdateCurrentTime = this.shouldUpdateCurrentTime.bind(this);

            // Register listener to change PiP state when channel changes
            Dispatcher.subscribe('CHANNEL_SELECT', this.onChannelSelect);

            Dispatcher.subscribe('PIP_EMBED_ID_UPDATE', this.onEmbedId);

            if (!this.embedId) {
                Dispatcher.subscribe('PIP_SHOULD_UPDATE_CURRENT_TIME', this.shouldUpdateCurrentTime);
            }

            // Used to figure out if pip window for video closed while in PiP preview embed mode
            Dispatcher.subscribe('PICTURE_IN_PICTURE_CLOSE', this.onPipClose);

            let messageId = props.messageId;
            let channelId = props.channelId;
            let guildId = props.guildId;
            if (embedRegistry.has(this.embedId)) {
                const obj = embedRegistry.get(this.embedId);
                messageId = obj.messageId;
                channelId = obj.channelId;
                guildId = obj.guildId;
            }

            let canGrab = false;
            if (messageId && channelId && props.embedId && hasPip(messageId, channelId, guildId)) {
                // TODO: Setting to change auto-grab or no
                canGrab = true;
            }

            this.state = {
                player: null,
                playerState: -1,
                messageId: messageId,
                channelId: channelId,
                guildId: guildId,
                showClose: false,
                started: !!currentTime,
                currentTime: currentTime,
                canGrab: canGrab,
                volume: volume
            };
        }

        grabPlayer() {
            let grabbed = captureYouTubePiP(this.state.messageId, this.state.channelId, this.state.guildId, this.videoId);
            if (grabbed) {
                this.setState({currentTime: grabbed.currentTime, started: true, volume: grabbed.volume});
            }
        }

        // YouTube stuff

        onPlayerReady(e) {
            this.setState({player: e.target});
            e.target.setVolume(this.state.volume);

            if (this.state.currentTime > 0) {
                e.target.seekTo(this.state.currentTime);
                e.target.playVideo();
            }
        }

        onPlayerError(e) {
            Logger.err(`PLAYER ERROR! ${e.data}`);
        }

        onPlayerState(e) {
            this.setState({playerState: e.data});
            if (e.data === 1) {
                lastStartedVideo = {
                    videoId: this.videoId,
                    messageId: this.state.messageId
                };
            }
        }

        onChannelSelect(e) {
            if (embedRegistry.has(this.embedId)) {
                const obj = embedRegistry.get(this.embedId);
                this.setState({
                    messageId: obj.messageId,
                    channelId: obj.channelId,
                    guildId: obj.guildId
                });
            }

            if (!this.state.channelId || !this.state.messageId || !this.state.guildId) {
                Logger.err('No info for PiP!');
            }

            // Don't do anything if not playing
            if (this.state.playerState !== 1) {
                return;
            }

            const player = this.state.player.playerInfo;
            // If embedded, OPEN on all changes
            if (this.embedId) {
                if (lastStartedVideo?.videoId === this.videoId && lastStartedVideo?.messageId === this.state.messageId) {
                    registerYouTubePiP(this.videoId, this.state.player.getCurrentTime(), this.state.player.getVolume(), this.state.messageId, this.state.channelId, this.state.guildId);

                    lastStartedVideo = null;
                }
                
            }
        }

        onEmbedId(e) {
            if (this.state.messageId) {
                return;
            }

            if (e.added.has(this.embedId)) {
                const obj = e.added.get(this.embedId);
                this.setState({
                    messageId: obj.messageId,
                    channelId: obj.channelId,
                    guildId: obj.guildId
                });
            }
        }

        shouldUpdateCurrentTime(_) {
            const id = `E${this.state.guildId}:${this.state.channelId}:${this.state.messageId}`;
            let old = pipRegistry.get(id);
            old.currentTime = this.state.player.getCurrentTime();
            pipRegistry.set(id, old);
        }

        onPipClose(_) {
            if (!hasPip(this.state.messageId, this.state.channelId, this.state.guildId)) {
                this.setState({canGrab: false});
            }
        }

        componentWillUnmount() {
            Dispatcher.unsubscribe('PIP_EMBED_ID_UPDATE', this.onEmbedId);
            Dispatcher.unsubscribe('CHANNEL_SELECT', this.onChannelSelect);
            Dispatcher.unsubscribe('PICTURE_IN_PICTURE_CLOSE', this.onPipClose);

            if (!this.embedId) {
                Dispatcher.unsubscribe('PIP_SHOULD_UPDATE_CURRENT_TIME', this.shouldUpdateCurrentTime);
            }
        }

        coverClick(_) {
            if (this.state.playerState === 1) {
                this.state.player.pauseVideo();
            } else {
                this.state.player.playVideo();
            }
        }

        onCloseClick() {
            captureYouTubePiP(this.state.messageId, this.state.channelId, this.state.guildId, this.videoId);
        }

        onDoubleClick() {
            Transitions.transitionTo(`/channels/${this.state.guildId}/${this.state.channelId}/${this.state.messageId}`);
        }

        renderPlayer() {
            const opts = {
                playerVars: {
                    controls: this.embedId ? 1 : 0,
                    autoplay: 1
                }
            }

            return <div onDoubleClick={this.onDoubleClick}>
                {!this.embedId && <div>
                    <div className='playerUi' onClick={this.coverClick}>
                        <button onClick={this.onCloseClick} className='closeWrapper'>
                            CLOSE
                        </button>
                    </div>
                </div>}
                <YouTube videoId={this.videoId} onReady={this.onPlayerReady} className={!!this.embedId ? "youtubeEmbed" : "youtubePiP"} onError={this.onPlayerError} onStateChange={this.onPlayerState} opts={opts}/>
            </div>
        }

        renderVideoPreview() {
            return <div className='embedFrame'>
                <img src={`https://i.ytimg.com/vi/${this.videoId}/maxresdefault.jpg`} className='embedThumbnail' onClick={() => this.setState({started: true})}/>
                {React.createElement(VideoPlayPill, {
                    externalURL: `https://youtube.com/watch?v=${this.videoId}`,
                    onPlay: () => {
                        this.setState({started: true});
                    },
                    renderLinkComponent: () => {
                        <p>LINK</p>
                    },
                    className: 'absoluteCenter'
                })}
            </div>
        }

        renderPreview() {
            return this.embedId && this.state.canGrab ? <EmbedCapturePrompt onCaptureRequest={() => { this.grabPlayer(); }}/> : this.renderVideoPreview();
        }

        render() {
            return <div className={this.embedId ? 'embedMargin' : ''}>
                {this.state.started || !this.embedId ? this.renderPlayer() : this.renderPreview()}
            </div>;
        }
    }

    return class PipEmbeds extends Plugin {
        onStart() {
            BdApi.injectCSS('PiPEmbeds', `
                .fullFrame {
                    width: 100%;
                    height: 100%;
                }

                .embedFrame {
                    width: 400px;
                    height: 225px;
                    position: relative;
                    background: #0f0f0f;
                    border-radius: 8px;
                }

                .coverFrame {
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    z-index: 1;
                }

                .playerUi {
                    box-shadow: inset 0 40px 10px -10px rgb(0 0 0 / 80%);
                    position: absolute;
                    z-index: 2;
                    display: block;
                    opacity: 0;
                    width: 100%;
                    height: 100%;
                    transition-duration: 0.3s;
                    transition-property: opacity;
                }

                .playerUi:hover {
                    opacity: 1;
                }

                .closeWrapper {
                    margin-top: 6px;
                    margin-bottom: 15px;
                    background: none;
                    color: var(--interactive-normal);
                    font-weight: bold;
                }

                .closeWrapper:hover {
                    color: var(--interactive-hover);
                }

                .youtubePiP {
                    position: absolute;
                    z-index: -1;
                    width: 100%;
                    height: 100%;
                }

                .youtubeEmbed {
                    width: 400px;
                    height: 225px;
                    border-radius: 8px;
                }

                .embedThumbnail {
                    width: 100%;
                    height: auto;
                    border-radius: 8px;
                    position: absolute;
                }

                .embedMargin {
                    margin-top: 16px;
                }

                .absoluteCenter {
                    left: 50%;
                    top: 50%;
                    transform: translate(-50%, -50%);
                    position: absolute;
                }

                .verticalAlign {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }
            `);

            Patcher.after(PiPWindow.PictureInPictureWindow.prototype, 'render', (that, _, ret) => {
                if (pipRegistry.has(that.props.id)) {
                    const data = pipRegistry.get(that.props.id);
                    const [guildId, channelId, messageId] = that.props.id.split(':');
                    ret.props.children.props.children = [
                        <div style={{width: '320px', height: '180px'}}>
                            <YouTubeFrame data={data} messageId={messageId} channelId={channelId} guildId={guildId.substring(1)}/>
                        </div>
                    ]
                }
            })

            Patcher.after(Embed.default.prototype, 'render', (that, args, ret) => {
                if (!(that.props.embed.url && that.props.embed.url.includes('youtube.com'))) {
                    return;
                }

                ret.props.children.props.children[6] = (
                    <YouTubeFrame embedId={that.props.embed.id} data={{videoId: (new URL(that.props.embed.url)).searchParams.get('v')}}/>
                )
            });

            this.messageCreate = e => {
                if (e.channelId !== SelectedChannelStore.getChannelId()) {
                    return;
                }

                this.forceUpdateEmbedIds(e.message);
            }

            Dispatcher.subscribe('MESSAGE_CREATE', this.messageCreate);

            this.channelSelect = _ => {
                embedRegistry.clear();
                this.forceUpdateEmbedIds(null);
            }

            Dispatcher.subscribe('CHANNEL_SELECT', this.channelSelect);
            Dispatcher.subscribe('LOAD_MESSAGES_SUCCESS', this.channelSelect);

            Patcher.after(Video.prototype, 'render', (that, args, ret) => {
                /*Logger.log(that)
                Logger.log(args)
                Logger.log(ret)

                const comp = ret.props.children;

                ret.props.children = (
                    <DiscordVideoFrame>
                        {comp}
                    </DiscordVideoFrame>
                )*/

                // ret = <DiscordVideoFrame that={that}/>
                // ret = <video controls={false} playsInline={true} onClick={that.handleVideoClick} onEnded={that.handleEnded} onLoadedMetadata={that.handleLoaded} onProgress={that.handleBuffer} preload={that.state.preload} ref={that.mediaRef} src={that.props.src}/>
            })

            return;

            Patcher.after(Dispatcher, 'dispatch', (_, [arg], ret) => {
                /*if (!arg.type.includes('PICTURE_IN_PICTURE')) {
                    return;
                }*/
                //Logger.log("PiP Dispatch")
                Logger.log(arg)
            })
        }

        onStop() {
            BdApi.clearCSS('PiPEmbeds');
            Dispatcher.unsubscribe('MESSAGE_CREATE', this.messageCreate);
            Dispatcher.unsubscribe('CHANNEL_SELECT', this.channelSelect);
            Dispatcher.unsubscribe('LOAD_MESSAGES_SUCCESS', this.channelSelect);
            Patcher.unpatchAll();
        }

        forceUpdateEmbedIds(msg) {
            const channelId = SelectedChannelStore.getChannelId();
            const messages = msg ? [msg] : MessageStore.getMessages(channelId)._array;
            const addedEmbeds = new Map();

            for (const message of messages) {
                const messageInfo = {
                    messageId: message.id,
                    channelId: channelId,
                    guildId: SelectedGuildStore.getGuildId()
                };

                if (message.embeds.length > 0) {
                    for (const embed of message.embeds) {
                        embedRegistry.set(embed.id, messageInfo);
                        addedEmbeds.set(embed.id, messageInfo);
                    }
                }
            }

            Dispatcher.dirtyDispatch({
                type: 'PIP_EMBED_ID_UPDATE',
                added: addedEmbeds
            });
        }
    }
}