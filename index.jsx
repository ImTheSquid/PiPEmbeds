import YouTube from 'react-youtube'

module.exports = (Plugin, Library) => {
    'use strict';

    const {Patcher, Logger, ContextMenu, DiscordModules} = Library;
    const {React, Dispatcher, SelectedChannelStore} = DiscordModules;

    const Embed = BdApi.findModuleByProps('EmbedVideo');

    class YoutubeFrame extends React.Component {
        constructor(props) {
            super(props);

            this.isEmbed = props.isEmbed ? true : false

            this.onPlayerReady = this.onPlayerReady.bind(this);
            this.onPlayerError = this.onPlayerError.bind(this);
            this.onPlayerState = this.onPlayerState.bind(this);
            this.coverClick = this.coverClick.bind(this);
            this.onChannelSelect = this.onChannelSelect.bind(this);

            // Register listener to change PiP state when channel changes
            Dispatcher.subscribe('CHANNEL_SELECT', this.onChannelSelect);

            this.state = {
                player: null,
                playerState: -1
            }
        }

        onPlayerReady(e) {
            Logger.log("PLAYER READY!")
            this.setState({player: e.target});
            //setTimeout(() => {this.state.player.playVideo()}, 3000)
        }

        onPlayerError(e) {
            Logger.err(`PLAYER ERROR! ${e.data}`);
        }

        onPlayerState(e) {
            this.setState({playerState: e.data});
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
            Logger.log(e)
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
                <YouTube videoId="dQw4w9WgXcQ" className={this.isEmbed ? "youtubeEmbed" : "youtubePiP"} onReady={this.onPlayerReady} onError={this.onPlayerError} onStateChange={this.onPlayerState} opts={opts}/>
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
                }
            `);

            ContextMenu.getDiscordMenu('PictureInPictureVideo').then(comp => {
                Patcher.after(comp, 'default', (_, args, ret) => {
                    // Logger.log(args);
                    // Logger.log(ret);

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
                    <YoutubeFrame isEmbed/>
                )
            });
        }

        onStop() {
            Patcher.unpatchAll();
        }
    }
}