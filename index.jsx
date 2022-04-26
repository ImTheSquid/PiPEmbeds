import YouTube from 'react-youtube'

module.exports = (Plugin, Library) => {
    'use strict';

    const {Patcher, Logger, DiscordModules, WebpackModules} = Library;
    const {React, Dispatcher, SelectedChannelStore, MessageStore, ChannelStore, SelectedGuildStore} = DiscordModules;

    const Embed = BdApi.findModuleByProps('EmbedVideo');
    const PiPWindow = WebpackModules.find(m => m.PictureInPictureWindow?.displayName === "PictureInPictureWindow");
    const Transitions = BdApi.findModuleByProps("transitionTo");
    const VideoPlayPill = BdApi.findModuleByDisplayName("VideoPlayPill");

    const embedRegistry = new Map();
    const pipRegistry = new Map();

    function registerYouTubePiP(videoId, currentTime, messageId, channelId, guildId) {
        Logger.log(videoId)
        Logger.log(currentTime)
        Logger.log(messageId)
        Logger.log(channelId)
        const id = `E${guildId}:${channelId}:${messageId}`;
        pipRegistry.set(id, {
            videoId: videoId,
            currentTime: currentTime
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

    function grabYouTubePiP(messageId, channelId, guildId, videoId) {
        const id = `E${guildId}:${channelId}:${messageId}`;
        if (!pipRegistry.has(id)) {
            return null;
        }

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

    class ExtractableFrame extends React.Component {
        constructor(props) {
            super(props);

            this.embedId = props.embedId;
            this.pipId = props.pipId;
            this.videoId = props.videoId;
            this.currentTime = props.currentTime;

            this.onPlayerReady = this.onPlayerReady.bind(this);
            this.onPlayerError = this.onPlayerError.bind(this);
            this.onPlayerState = this.onPlayerState.bind(this);
            this.coverClick = this.coverClick.bind(this);
            this.onChannelSelect = this.onChannelSelect.bind(this);
            this.onEmbedId = this.onEmbedId.bind(this);
            this.onCloseClick = this.onCloseClick.bind(this);
            this.onDoubleClick = this.onDoubleClick.bind(this);

            // Register listener to change PiP state when channel changes
            Dispatcher.subscribe('CHANNEL_SELECT', this.onChannelSelect);

            Dispatcher.subscribe('PIP_EMBED_ID_UPDATE', this.onEmbedId);

            let messageId = props.messageId;
            let channelId = props.channelId;
            let guildId = props.guildId;
            if (embedRegistry.has(this.embedId)) {
                const obj = embedRegistry.get(this.embedId);
                messageId = obj.messageId;
                channelId = obj.channelId;
                guildId = obj.guildId;
            }

            if (messageId && channelId && props.embedId) {
                let grabbed = grabYouTubePiP(messageId, channelId, guildId, props.videoId);
                if (grabbed) {
                    this.currentTime = grabbed.currentTime;
                }
            }

            this.state = {
                player: null,
                playerState: -1,
                messageId: messageId,
                channelId: channelId,
                guildId: guildId,
                showClose: false,
                started: !!this.currentTime
            };
        }

        onPlayerReady(e) {
            this.setState({player: e.target});

            if (this.currentTime > 0) {
                e.target.seekTo(this.currentTime);
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
                    registerYouTubePiP(this.videoId, this.state.player.getCurrentTime(), this.state.messageId, this.state.channelId, this.state.guildId);

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

        componentWillUnmount() {
            Dispatcher.unsubscribe('PIP_EMBED_ID_UPDATE', this.onEmbedId);
            Dispatcher.unsubscribe('CHANNEL_SELECT', this.onChannelSelect);
        }

        coverClick(_) {
            if (this.state.playerState === 1) {
                this.state.player.pauseVideo();
            } else {
                this.state.player.playVideo();
            }
        }

        onCloseClick() {
            grabYouTubePiP(this.state.messageId, this.state.channelId, this.state.guildId, this.videoId);
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

            return (<div onDoubleClick={this.onDoubleClick}>
                {!this.embedId && <div>
                    <div className='playerUi' onClick={this.coverClick}>
                        <button onClick={this.onCloseClick} className='closeWrapper'>
                            CLOSE
                        </button>
                    </div>
                </div>}
                <YouTube videoId={this.videoId} onReady={this.onPlayerReady} className={!!this.embedId ? "youtubeEmbed" : "youtubePiP"} onError={this.onPlayerError} onStateChange={this.onPlayerState} opts={opts}/>
            </div>);
        }

        renderPreview() {
            return (
                <div className='embedFrame'>
                    <img src={`https://i.ytimg.com/vi/${this.videoId}/maxresdefault.jpg`} className='embedThumbnail'/>
                    {React.createElement(VideoPlayPill, {
                        externalURL: `https://youtube.com/watch?v=${this.videoId}`,
                        onPlay: () => {
                            this.setState({started: true});
                        },
                        renderLinkComponent: () => {
                            <p>LINK</p>
                        },
                        className: 'embedPlayPill'
                    })}
                </div>
            );
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

                .embedPlayPill {
                    left: 50%;
                    top: 50%;
                    transform: translate(-50%, -50%);
                    position: absolute;
                }
            `);

            Patcher.after(PiPWindow.PictureInPictureWindow.prototype, 'render', (that, _, ret) => {
                if (pipRegistry.has(that.props.id)) {
                    const data = pipRegistry.get(that.props.id);
                    const [guildId, channelId, messageId] = that.props.id.split(':');
                    ret.props.children.props.children = [
                        <div style={{width: '320px', height: '180px'}}>
                            <ExtractableFrame videoId={data.videoId} currentTime={data.currentTime} messageId={messageId} channelId={channelId} guildId={guildId.substring(1)}/>
                        </div>
                    ]
                }
            })

            Patcher.after(Embed.default.prototype, 'render', (that, args, ret) => {
                if (!(that.props.embed.url && that.props.embed.url.includes('youtube.com'))) {
                    return;
                }

                ret.props.children.props.children[6] = (
                    <ExtractableFrame embedId={that.props.embed.id} videoId={(new URL(that.props.embed.url)).searchParams.get('v')}/>
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