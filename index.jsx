import YouTube from 'react-youtube'

module.exports = (Plugin, Library) => {
    'use strict';

    const {Patcher, Logger, ContextMenu, DiscordModules} = Library;
    const {React, Dispatcher, SelectedChannelStore, MessageStore} = DiscordModules;

    const Embed = BdApi.findModuleByProps('EmbedVideo');
    const MessageAccessories = BdApi.findModuleByProps("MessageAccessories");

    const pipRegistry = new Map();

    function registerYouTubePiP(videoId, currentTime, messageId, channelId) {
        pipRegistry.set(`E${channelId}:${messageId}`, {
            videoId: videoId,
            currentTime: currentTime
        });
    }

    function grabYouTubePiP(messageId, channelId) {
        const id = `E${channelId}:${messageId}`;
        if (!pipRegistry.has(id)) {
            return null;
        }

        const val = pipRegistry.get(id);
        pipRegistry.delete(id);
        return val;
    }

    let lastStartedVideo = null;

    class YoutubeFrame extends React.Component {
        constructor(props) {
            super(props);

            this.isEmbed = props.isEmbed ? true : false;
            this.videoId = props.videoId;

            this.onPlayerReady = this.onPlayerReady.bind(this);
            this.onPlayerError = this.onPlayerError.bind(this);
            this.onPlayerState = this.onPlayerState.bind(this);
            this.coverClick = this.coverClick.bind(this);
            this.onChannelSelect = this.onChannelSelect.bind(this);

            // Register listener to change PiP state when channel changes
            Dispatcher.subscribe('CHANNEL_SELECT', this.onChannelSelect);

            this.state = {
                player: null,
                playerState: -1,
                messageId: null,
                channelId: null,
            };
        }

        onPlayerReady(e) {
            this.setState({player: e.target});
            //setTimeout(() => {this.state.player.playVideo()}, 3000)
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

        /*componentDidMount() {
            this.setState({player: new YT.Player(this.state.divId, {
                width: 400,
                height: 225,
                videoId: 'dQw4w9WgXcQ',
                playerVars: {
                    controls: this.isEmbed
                },
                events: {
                    onReady: this.onPlayerReady,
                    onError: this.onPlayerError,
                    onStateChange: this.onPlayerState,
                }
            })})
        }

        componentWillUnmount() {
            if (Object.keys(this.state.player.playerInfo).length == 0) {
                return;
            }
            Logger.log("UNMOUNT")
            Logger.log(this.state.player)
            this.state.player.stopVideo();
            Logger.log(typeof(this.state.player.h))
            this.state.player.h = null;
        }*/

        onChannelSelect(e) {
            // Don't do anything if not playing
            if (this.state.playerState !== 1) {
                return;
            }
            Logger.log(e)
            return
            const player = this.state.player.playerInfo;
            // If embedded, OPEN on all changes
            if (this.isEmbed) {
                if (lastStartedVideo?.videoId === this.videoId && lastStartedVideo?.messageId === this.state.messageId) {
                    /*Dispatcher.dirtyDispatch({
                        type: 'PICTURE_IN_PICTURE_OPEN',
                        component: 'VIDEO',
                        id: `$${JSON.stringify({
                            videoId: this.videoId,
                            currentTime: player.currentTime
                        })}$`,
                        props: {

                        }
                    })*/

                    registerYouTubePiP(this.videoId, this.state.currentTime, this.state.messageId, this.state.channelId);

                    lastStartedVideo = null;
                }
                
            } else { // If PiP, CLOSE if going back to original channel and restart video

            }
        }

        componentWillUnmount() {
            Dispatcher.unsubscribe('CHANNEL_SELECT', this.onChannelSelect);
        }

        coverClick(_) {
            if (this.state.playerState === 1) {
                this.state.player.pauseVideo();
            } else {
                this.state.player.playVideo();
            }
        }

        render() {
            const opts = {
                playerVars: {
                    controls: this.isEmbed ? 1 : 0
                }
            }

            return (<div>
                {!this.isEmbed && <div className="coverFrame" onClick={this.coverClick}/>}
                <YouTube videoId={this.videoId} className={this.isEmbed ? "youtubeEmbed" : "youtubePiP"} onReady={this.onPlayerReady} onError={this.onPlayerError} onStateChange={this.onPlayerState} opts={opts}/>
            </div>)
        }
    }

    return class PipEmbeds extends Plugin {
        onStart() {
            BdApi.injectCSS('PiPEmbeds', `
                .pipFrame {
                    width: 100%;
                    height: 100%;
                }

                .coverFrame {
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    z-index: 1;
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
                    margin-top: 16px;
                    border-radius: 4px;
                }
            `);

            ContextMenu.getDiscordMenu('PictureInPictureVideo').then(comp => {
                Patcher.after(comp, 'default', (_, args, ret) => {
                    // Logger.log(args)
                    // Logger.log(ret)

                    //ret.props.children = [<p>HELLO THIS IS A TEST</p>]
                    ret.props.children = [<YoutubeFrame/>]
                });
            });

            Logger.log(Embed)
            Patcher.after(Embed.default.prototype, 'render', (that, args, ret) => {
                if (!(that.props.embed.url && that.props.embed.url.includes('youtube.com'))) {
                    return;
                }

                Logger.log("call")
                Logger.log(args)
                Logger.log(ret)
                Logger.log(that)

                ret.props.children.props.children[6] = (
                    <YoutubeFrame isEmbed videoId={(new URL(that.props.embed.url)).searchParams.get('v')}/>
                )
            });

            /*Logger.log(MessageAccessories)
            Patcher.after(MessageAccessories.MessageAccessories.prototype, 'render', (_, args, ret) => {
                // Logger.log(args)
                Logger.log(ret)
            });*/

            this.messageCreate = e => {
                if (e.channelId !== SelectedChannelStore.getChannelId()) {
                    return;
                }

                this.forceUpdateEmbedIds(e.message);
            }

            Dispatcher.subscribe('MESSAGE_CREATE', this.messageCreate);

            this.channelSelect = _ => {
                this.forceUpdateEmbedIds(null);
            }

            Dispatcher.subscribe('CHANNEL_SELECT', this.channelSelect);

            Patcher.after(Dispatcher, 'dispatch', (_, [arg], ret) => {
                if (!arg.type.includes('PICTURE_IN_PICTURE')) {
                    return;
                }
                Logger.log("call")
                Logger.log(arg)
            })
        }

        onStop() {
            Dispatcher.unsubscribe('MESSAGE_CREATE', this.messageCreate);
            Dispatcher.unsubscribe('CHANNEL_SELECT', this.channelSelect);
            Patcher.unpatchAll();
        }

        forceUpdateEmbedIds(msg) {
            const messages = msg ? [msg] : MessageStore.getMessages(SelectedChannelStore.getChannelId())._array;

            for (const message of messages) {

            }
        }
    }
}