import YouTube from 'react-youtube'

module.exports = (Plugin, Library) => {
    'use strict';
    const {Webpack} = BdApi;

    const {Patcher, Logger, DiscordModules, WebpackModules, Settings, PluginUtilities} = Library;
    const {SettingPanel, Switch, Slider} = Settings;
    const {React, Dispatcher, SelectedChannelStore, MessageStore, SelectedGuildStore, ButtonData} = DiscordModules;

    // Fixed
    const Embed = BdApi.Webpack.getModule(BdApi.Webpack.Filters.byPrototypeFields("render", "renderVideo"));
    const Transitions = BdApi.Webpack.getModule(m => Object.values(m).filter(v => v?.toString).map(v => v.toString()).some(v => v.includes("transitionTo - Transitioning to")));
    const transitionTo = Transitions[getFunctionNameFromString(Transitions, ["transitionTo - TransitioningTo"])];
    const MessageAccessories = Object.values(Webpack.getModule(m => Object.values(m).some(k => k?.prototype && Object.keys(k.prototype).includes("renderAttachments")))).find(v => v?.prototype && Object.keys(v.prototype).includes("renderAttachments"));
    const VideoPlayPill = BdApi.Webpack.getModule(m => Object.values(m).filter(v => v?.toString).map(v => v.toString()).some(v => v.includes("renderLinkComponent")));
    const PiPWindow = BdApi.Webpack.getModule(m => Object.values(m).filter(v => v?.toString).map(v => v.toString()).some(v => v.includes("PIP")));

    const MediaPlayerRoot = BdApi.Webpack.getModule(m => Object.values(m).some(v => v?.prototype && Object.keys(v.prototype).includes("renderControls")));
    const MediaPlayer = MediaPlayerRoot[Object.entries(MediaPlayerRoot).filter(([k, v]) => v?.prototype && Object.keys(v.prototype).includes("renderControls"))[0][0]];

    const PictureInPictureContainerRoot = BdApi.Webpack.getModule(m => Object.values(m).some(v => v?.prototype && Object.keys(v.prototype).includes("calculateDecayingPosition")));
    const PictureInPictureContainer = PictureInPictureContainerRoot[Object.entries(PictureInPictureContainerRoot).filter(([k, v]) => v?.prototype && Object.keys(v.prototype).includes("calculateDecayingPosition"))[0][0]];

    // Broken
    // Maybe: BdApi.Webpack.getModule(m => m.b_ && m.Rp && m.A7 && m.DR), function that contains array with "onMute" and "autoMute"
    // const AttachmentContent = BdApi.findModuleByProps("renderPlaintextFilePreview");
    const AttachmentContent = BdApi.Webpack.getModule(BdApi.Webpack.Filters.byPrototypeFields("renderVideo"));

    function getFunctionNameFromString(obj, search) {
        for (const [k, v] of Object.entries(obj)) {
            if (search.every(str => v?.toString().match(str))) {
                return k;
            }
        }
        return null;
    }

    const embedRegistry = new Map();
    const pipRegistry = new Map();
    let currentPiP = null;
    let lastStartedVideo = null;

    const defaultSettings = {
        autoCapture: false,
        scrollStep: 50
    };

    let settings = null;

    function reloadSettings() {
        settings = PluginUtilities.loadSettings("PiPEmbeds", defaultSettings);
    }

    function base(urlStr) {
        const url = new URL(urlStr);
        return url.origin + url.pathname;
    }

    const crypto = require('crypto');
    function getId(messageId, channelId, guildId, ref) {
        return `E${guildId}:${channelId}:${messageId}:${crypto.createHash('sha256').update(ref).digest('base64')}`;
    }

    function registerPiP(ref, currentTime, volume, messageId, channelId, guildId) {
        const id = getId(messageId, channelId, guildId, ref);
        pipRegistry.set(id, {
            ref: ref,
            currentTime: currentTime,
            volume: volume
        });

        Dispatcher.dispatch({
            type: 'PIP_OPEN',
            id: id
        });
    }

    function hasPip(messageId, channelId, guildId, ref) {
        return pipRegistry.has(getId(messageId, channelId, guildId, ref))
    }

    function capturePiP(messageId, channelId, guildId, ref) {
        const id = getId(messageId, channelId, guildId, ref);
        if (!pipRegistry.has(id)) {
            return null;
        }

        // Request that all PiP players update the current time of respective videos in preparation for possible capture
        Dispatcher.dispatch({type: 'PIP_SHOULD_UPDATE_CURRENT_TIME'});

        const val = pipRegistry.get(id);
        if (ref !== val.ref) {
            return null;
        }

        pipRegistry.delete(id);

        Dispatcher.dispatch({
            type: 'PIP_CLOSE',
            next: next(1)
        });

        return val;
    }

    function next(steps) {
        const pipKeys = Array.from(pipRegistry.keys());

        if (pipKeys.length == 0) {
            return null;
        }

        const idx = pipKeys.findIndex(key => key === currentPiP); // Find position to get next stream (will go to next if possible first)
        let newPos = idx + steps;
        if (newPos < 0) {
            newPos = pipKeys.length + newPos % pipKeys.length;
        } else if (newPos >= pipRegistry.size) {
            newPos = newPos % pipKeys.length;
        }

        return pipKeys[newPos];
    }

    function processPiPScroll(deltaY) {
        // Return if only one PiP window
        if (pipRegistry.size <= 1) {
            BdApi.showToast('No other media sources to switch to!', {type: 'warning'});
            return;
        }

        // Determine # of changes
        const changes = Math.round(deltaY / settings.scrollStep);

        // Make sure players sync time with store before unmount
        Dispatcher.dispatch({type: 'PIP_SHOULD_UPDATE_CURRENT_TIME'});

        Dispatcher.dispatch({
            type: 'PIP_OPEN',
            id: next(changes) // Find current position in map and offset as needed
        });
    }

    function EmbedCapturePrompt(props) {
        return <div className='embedFrame' style={{width: props.width ?? '400px', height: props.height ?? '225px'}}>
            <div className='absoluteCenter verticalAlign'>
                <svg height="48" width="48" style={{fill: "var(--blurple)"}}><path d="M22.3 25.85H39.05V13H22.3ZM7 40Q5.8 40 4.9 39.1Q4 38.2 4 37V11Q4 9.8 4.9 8.9Q5.8 8 7 8H41Q42.25 8 43.125 8.9Q44 9.8 44 11V37Q44 38.2 43.125 39.1Q42.25 40 41 40ZM7 37Q7 37 7 37Q7 37 7 37V11Q7 11 7 11Q7 11 7 11Q7 11 7 11Q7 11 7 11V37Q7 37 7 37Q7 37 7 37ZM7 37H41Q41 37 41 37Q41 37 41 37V11Q41 11 41 11Q41 11 41 11H7Q7 11 7 11Q7 11 7 11V37Q7 37 7 37Q7 37 7 37ZM25.3 22.85V16H36.05V22.85Z"/></svg>
                <span style={{fontWeight: 'bold', marginBottom: '10px', color: 'var(--text-color)', textAlign: 'center'}}>Currently in PiP Mode</span>
                {React.createElement(ButtonData.default, {
                    onClick: props.onCaptureRequest
                }, ['Exit PiP'])}
            </div>
        </div>
    }

    function PiPControls(props) {
        // Style tag is only needed for Discord embeds because the video element is weird
        return <div onDoubleClick={props.onDoubleClick} style={{width: 'inherit', height: 'inherit'}}>
            {!this.embedId && <div>
                <div className='playerUi' onClick={props.onClick} onWheel={e => processPiPScroll(e.deltaY)}>
                    <button onClick={props.onCloseClick} className='closeWrapper'>
                        CLOSE
                    </button>
                </div>
            </div>}
            {props.children}
        </div>
    }

    // Totally didn't rip this straight from SO
    function calculateAspectRatioFit(srcWidth, srcHeight, maxWidth, maxHeight) {
        var ratio = Math.min(maxWidth / srcWidth, maxHeight / srcHeight);

        return { width: srcWidth*ratio, height: srcHeight*ratio };
    }

    class DiscordEmbedPiP extends React.Component {
        constructor(props) {
            super(props);

            this.onClick = this.onClick.bind(this);
            this.onCaptureClick = this.onCaptureClick.bind(this);
            this.shouldUpdateCurrentTime = this.shouldUpdateCurrentTime.bind(this);

            this.ref = React.createRef();

            Dispatcher.subscribe('PIP_SHOULD_UPDATE_CURRENT_TIME', this.shouldUpdateCurrentTime);

            this.src = props.data.ref;
            this.currentTime = props.data.currentTime;
            this.volume = props.data.volume;
            this.messageId = props.messageId;
            this.channelId = props.channelId;
            this.guildId = props.guildId;

            this.state = {
                width: null,
                height: null
            };
        }

        componentDidMount() {
            this.ref.current.onloadedmetadata = e => {
                const { width, height } = calculateAspectRatioFit(e.target.videoWidth, e.target.videoHeight, 320, 180);
                this.setState({width: width, height: height});
            };

            this.ref.current.currentTime = this.currentTime;
            this.ref.current.volume = this.volume;
        }

        onClick() {
            if (this.ref.current.paused) {
                this.ref.current.play();
            } else {
                this.ref.current.pause();
            }
        }

        onCaptureClick(e) {
            e.preventDefault();
            capturePiP(this.messageId, this.channelId, this.guildId, this.src);
        }

        shouldUpdateCurrentTime() {
            const id = getId(this.messageId, this.channelId, this.guildId, this.src);
            let old = pipRegistry.get(id);
            old.currentTime = this.ref.current.currentTime;
            pipRegistry.set(id, old);
        }

        componentWillUnmount() {
            Dispatcher.unsubscribe('PIP_SHOULD_UPDATE_CURRENT_TIME', this.shouldUpdateCurrentTime);
        }

        render() {
            return <PiPControls onDoubleClick={() => transitionTo(`/channels/${this.guildId}/${this.channelId}/${this.messageId}`)} onClick={this.onClick} onCloseClick={this.onCaptureClick}>
                <video src={this.src} autoPlay ref={this.ref} style={this.state.width ? {width: this.state.width, height: this.state.height} : {}}/>
            </PiPControls>
        }
    }

    class EmbedFrameOverlay extends React.Component {
        constructor(props) {
            super(props);
            this.original = props.original;
            const MAX_WIDTH = 400, MAX_HEIGHT = 300;
            const res = calculateAspectRatioFit(props.width, props.height, MAX_WIDTH, MAX_HEIGHT);
            this.width = res.width;
            this.height = res.height;

            const url = new URL(this.original.props.src);
            this.id = url.searchParams.get('pipembedsid');

            this.onCaptureRequest = this.onCaptureRequest.bind(this);
            this.onEmbedId = this.onEmbedId.bind(this);
            this.onPiPCaptured = this.onPiPCaptured.bind(this);

            Dispatcher.subscribe('PIP_EMBED_ID_UPDATE', this.onEmbedId);
            Dispatcher.subscribe('PIP_DISCORD_CLOSE', this.onPiPCaptured);

            let messageId = null;
            let channelId = null;
            let guildId = null;
            if (embedRegistry.has(this.id)) {
                const obj = embedRegistry.get(this.id);
                messageId = obj.messageId;
                channelId = obj.channelId;
                guildId = obj.guildId;
            }

            this.state = {
                messageId: messageId,
                channelId: channelId,
                guildId: guildId,
                showCapturePrompt: messageId && hasPip(messageId, channelId, guildId, base(this.original.props.src))
            };
        }

        onEmbedId(e) {
            if (this.state.messageId) {
                return;
            }

            if (e.added.has(this.id)) {
                const obj = e.added.get(this.id);
                this.setState({
                    messageId: obj.messageId,
                    channelId: obj.channelId,
                    guildId: obj.guildId,
                    showCapturePrompt: hasPip(obj.messageId, obj.channelId, obj.guildId, base(this.original.props.src))
                });
            }
        }

        onPiPCaptured() {
            this.setState({showCapturePrompt: false});
        }

        onCaptureRequest() {
            Dispatcher.dispatch({
                type: 'PIP_DISCORD_CLOSE',
                messageId: this.state.messageId,
                channelId: this.state.channelId,
                guildId: this.state.guildId,
                src: this.original.props.src
            });
        }

        componentDidMount() {
            if (this.state.showCapturePrompt && settings.autoCapture) this.onCaptureRequest();
        }

        componentWillUnmount() {
            Dispatcher.unsubscribe('PIP_EMBED_ID_UPDATE', this.onEmbedId);
            Dispatcher.unsubscribe('PIP_DISCORD_CLOSE', this.onPiPCaptured);
        }

        render() {
            return <div style={{position: 'relative', width: this.width, height: this.height}}>
                <div style={{position: 'absolute', zIndex: 1}}>
                    {this.state.showCapturePrompt && <EmbedCapturePrompt onCaptureRequest={this.onCaptureRequest} width={this.width} height={this.height}/>}
                </div>
                <div style={{position: 'absolute', zIndex: 0}}>
                    {this.original}
                </div>
            </div>
        }
    }

    class EmbedFrameShim extends React.Component {
        constructor(props) {
            super(props);

            this.original = props.original;
            this.original.props.width = 1000000;
            this.original.props.height = 1000000;
            this.that = props.that;
            const url = new URL(this.that.props.src);
            this.id = url.searchParams.get('pipembedsid');

            this.onChannelSelect = this.onChannelSelect.bind(this);
            this.onEmbedId = this.onEmbedId.bind(this);
            this.onPiPCaptured = this.onPiPCaptured.bind(this);

            Dispatcher.subscribe('CHANNEL_SELECT', this.onChannelSelect);
            Dispatcher.subscribe('PIP_EMBED_ID_UPDATE', this.onEmbedId);
            Dispatcher.subscribe('PIP_DISCORD_CLOSE', this.onPiPCaptured);

            let messageId = null;
            let channelId = null;
            let guildId = null;
            if (embedRegistry.has(this.id)) {
                const obj = embedRegistry.get(this.id);
                messageId = obj.messageId;
                channelId = obj.channelId;
                guildId = obj.guildId;
            }

            this.state = {
                messageId: messageId,
                channelId: channelId,
                guildId: guildId
            };
        }

        componentDidMount() {
            this.that.mediaRef.current.addEventListener("play", _ => {
                lastStartedVideo = {
                    ref: base(this.that.mediaRef.current.src),
                    messageId: this.state.messageId
                }
            });
        }

        onChannelSelect(_) {
            const video = this.that.mediaRef.current;
            if (video.paused || video.ended) return;

            // At this point the video should be sent to the PiP window
            if (!this.state.channelId || !this.state.messageId || !this.state.guildId) {
                Logger.err('No info for PiP!');
                return;
            }

            registerPiP(base(video.src), video.currentTime, video.volume, this.state.messageId, this.state.channelId, this.state.guildId);
        }

        onEmbedId(e) {
            if (this.state.messageId) {
                return;
            }

            if (e.added.has(this.id)) {
                const obj = e.added.get(this.id);
                this.setState({
                    messageId: obj.messageId,
                    channelId: obj.channelId,
                    guildId: obj.guildId
                });
            }
        }

        onPiPCaptured(e) {
            if (e.messageId == this.state.messageId && this.state.channelId == e.channelId && this.state.guildId == e.guildId && base(this.that.mediaRef.current.src) == base(e.src)) {
                const grabbed = capturePiP(e.messageId, e.channelId, e.guildId, base(e.src));
                this.that.mediaRef.current.volume = grabbed.volume;
                this.that.mediaRef.current.currentTime = grabbed.currentTime;
                this.that.setPlay(true);
            }
        }

        componentWillUnmount() {
            Dispatcher.unsubscribe('CHANNEL_SELECT', this.onChannelSelect);
            Dispatcher.unsubscribe('PIP_EMBED_ID_UPDATE', this.onEmbedId);
            Dispatcher.unsubscribe('PIP_DISCORD_CLOSE', this.onPiPCaptured);
        }

        render() {
            return this.original;
        }
    }

    class YouTubeFrame extends React.Component {
        constructor(props) {
            super(props);

            this.embedId = props.embedId;

            let data = props.data;

            this.videoId = data.ref;
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
            Dispatcher.subscribe('PIP_CLOSE', this.onPipClose);

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
            if (messageId && channelId && props.embedId && hasPip(messageId, channelId, guildId, this.videoId)) {
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
            let grabbed = capturePiP(this.state.messageId, this.state.channelId, this.state.guildId, this.videoId);
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
                    ref: this.videoId,
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
                return;
            }

            // Don't do anything if not playing
            if (this.state.playerState !== 1) {
                return;
            }

            // If embedded, OPEN on all changes
            if (this.embedId) {
                if (lastStartedVideo?.ref === this.videoId && lastStartedVideo?.messageId === this.state.messageId) {
                    registerPiP(this.videoId, this.state.player.getCurrentTime(), this.state.player.getVolume(), this.state.messageId, this.state.channelId, this.state.guildId);

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
            if (this.embedId) return;

            const id = getId(this.state.messageId, this.state.channelId, this.state.guildId, this.videoId);
            let old = pipRegistry.get(id);
            old.currentTime = this.state.player.getCurrentTime();
            pipRegistry.set(id, old);
        }

        onPipClose(_) {
            if (!hasPip(this.state.messageId, this.state.channelId, this.state.guildId, this.videoId)) {
                this.setState({canGrab: false});
            }
        }

        componentDidMount() {
            if (this.state.canGrab && settings.autoCapture) this.grabPlayer();
        }

        componentWillUnmount() {
            Dispatcher.unsubscribe('PIP_EMBED_ID_UPDATE', this.onEmbedId);
            Dispatcher.unsubscribe('CHANNEL_SELECT', this.onChannelSelect);
            Dispatcher.unsubscribe('PIP_CLOSE', this.onPipClose);

            // If this is a PiP component, unsubscribe from PiP-specific events
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

        onCloseClick(e) {
            e.preventDefault();
            capturePiP(this.state.messageId, this.state.channelId, this.state.guildId, this.videoId);
        }

        onDoubleClick() {
            transitionTo(`/channels/${this.state.guildId}/${this.state.channelId}/${this.state.messageId}`);
        }

        renderPlayer() {
            const opts = {
                playerVars: {
                    controls: this.embedId ? 1 : 0,
                    autoplay: 1
                }
            }

            const player = <YouTube videoId={this.videoId} onReady={this.onPlayerReady} className={!!this.embedId ? "youtubeEmbed" : "youtubePiP"} onError={this.onPlayerError} onStateChange={this.onPlayerState} opts={opts}/>

            return this.embedId ? player : <PiPControls onClick={this.coverClick} onDoubleClick={this.onDoubleClick} onCloseClick={this.onCloseClick}>
                {player}
            </PiPControls>
        }

        renderVideoPreview() {
            return <div className='embedFrame'>
                <img src={`https://img.youtube.com/vi/${this.videoId}/mqdefault.jpg`} className='embedThumbnail' onClick={() => this.setState({started: true})} style={{maxWidth: '100%', maxHeight:'100%'}}/>
                {React.createElement(VideoPlayPill[getFunctionNameFromString(VideoPlayPill, "renderLinkComponent")], {
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
            return <div className={this.embedId ? 'embedMargin' : ''} style={this.embedId ? {} : {width: '320px', height: '180px'}}>
                {this.state.started || !this.embedId ? this.renderPlayer() : this.renderPreview()}
            </div>
        }
    }

    // Manages state for selecting and switching PiP sources
    class PiPSourceController extends React.Component {
        constructor(props) {
            super(props);
            this.onPiPOpen = this.onPiPOpen.bind(this);
            this.onPiPClose = this.onPiPClose.bind(this);

            Dispatcher.subscribe('PIP_OPEN', this.onPiPOpen);
            Dispatcher.subscribe('PIP_CLOSE', this.onPiPClose);

            this.state = {
                currentId: null
            };
        }

        onPiPOpen(e) {
            currentPiP = e.id;
            this.setState({currentId: e.id});
        }

        onPiPClose(e) {
            currentPiP = e.next;
            this.setState({currentId: e.next});
        }

        componentWillUnmount() {
            Dispatcher.unsubscribe('PIP_OPEN', this.onPiPOpen);
            Dispatcher.unsubscribe('PIP_CLOSE', this.onPiPClose);
        }

        renderEmbed() {
            const data = pipRegistry.get(this.state.currentId);

            // I don't know why this happens sometimes, but it does
            if (!data) {
                Logger.err(`Failed to render embed with ID ${this.state.currentId}`);
                return null;
            }

            const [guildId, channelId, messageId] = this.state.currentId.split(':');

            if (data.ref.includes('discord')) {
                return <DiscordEmbedPiP data={data} messageId={messageId} channelId={channelId} guildId={guildId.substring(1)}/>
            } else {
                return <YouTubeFrame data={data} messageId={messageId} channelId={channelId} guildId={guildId.substring(1)}/>
            }
        }

        render() {
            return this.state.currentId ? this.renderEmbed() : null;
        }
    }

    // Handles window movement and positioning
    class PiPWindowController extends React.Component {
        constructor(props) {
            super(props);
            this.maxX = props.maxX;
            this.maxY = props.maxY;

            this.state = {
                position: "top-right"
            }
        }

        render() {
            const windows = new Map();
            
            const pipObj = {
                component: "EMBED",
                docked: false,
                id: "PIPEMBEDS",
                position: this.state.position,
                props: {}
            };

            windows.set("PIPEMBEDS", pipObj);

            return React.createElement(PiPWindow, {
                pipWindows: windows,
                selectedPIPWindow: pipObj,
                maxX: this.maxX,
                maxY: this.maxY,
                onWindowMove: (_, pos) => {
                    this.setState({position: pos});
                },
                pictureInPictureComponents: {
                    EMBED: PiPSourceController
                }
            })
        }
    }

    return class extends Plugin {
        onStart() {
            reloadSettings();

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

            Patcher.after(Embed.prototype, 'render', (that, args, ret) => {
                if (!(that.props.embed.url && (that.props.embed.url.includes('youtu.be') || that.props.embed.url.includes('youtube.com/watch')))) {
                    return;
                }

                ret.props.children.props.children[6] = (
                    <YouTubeFrame embedId={that.props.embed.id} data={{ref: (new URL(that.props.embed.url)).searchParams.get('v')}}/>
                )
            });

            this.messageCreate = e => {
                if (e.channelId !== SelectedChannelStore.getChannelId()) {
                    return;
                }

                this.forceUpdateEmbedIds(e.message);
            };

            Dispatcher.subscribe('MESSAGE_CREATE', this.messageCreate);

            this.channelSelect = _ => {
                embedRegistry.clear();
                this.forceUpdateEmbedIds(null);
            };

            Dispatcher.subscribe('CHANNEL_SELECT', this.channelSelect);
            Dispatcher.subscribe('LOAD_MESSAGES_SUCCESS', this.channelSelect);

            Patcher.instead(MediaPlayer.prototype, 'renderVideo', (that, args, original) => {
                return <EmbedFrameShim original={original(...args)} that={that}/>
            });

            Patcher.instead(AttachmentContent, 'renderVideoComponent', (_, [arg], original) => {
                return <EmbedFrameOverlay original={original(arg)} width={arg.width} height={arg.height}/>
            });

            Patcher.after(MessageAccessories.prototype, 'renderAttachments', (that, [arg], ret) => {
                if (!ret) return;

                for (const child of ret) {
                    if (child.props.children.props.attachment) {
                        const url = new URL(child.props.children.props.attachment.url);
                        url.searchParams.set('pipembedsid', child.props.children.props.attachment.id);
                        child.props.children.props.attachment.url = url.toString();
                    } else if (child.props.children.props.attachmentData) {
                        const url = new URL(child.props.children.props.attachmentData.url);
                        url.searchParams.set('pipembedsid', child.props.children.props.attachmentData.id);
                        child.props.children.props.attachmentData.url = url.toString();
                    }
                }
            });

            Patcher.after(MessageAccessories.prototype, 'renderEmbeds', (_, __, ret) => {
                if (!ret) return;

                for (const child of ret) {
                    if (!child.props.children.props.embed || child.props.children.props.embed.type != 'video') continue;

                    const url = new URL(child.props.children.props.embed.url);
                    url.searchParams.set('pipembedsid', child.props.children.props.embed.id);
                    child.props.children.props.embed.url = url.toString();
                    child.props.children.props.embed.video.url = url.toString();
                    child.props.children.props.embed.video.proxyURL = url.toString();
                }
            });

            Patcher.instead(PictureInPictureContainer.prototype, 'render', (that, _, original) => {
                const origin = original();

                // If in a popout window, return originial only
                if (that._reactInternals.index > 1) {
                    return origin;
                }

                return <>
                    {origin}
                    <PiPWindowController maxX={origin.props.maxX} maxY={origin.props.maxY}/>
                </>
            });
        }

        onStop() {
            BdApi.clearCSS('PiPEmbeds');
            Dispatcher.unsubscribe('MESSAGE_CREATE', this.messageCreate);
            Dispatcher.unsubscribe('CHANNEL_SELECT', this.channelSelect);
            Dispatcher.unsubscribe('LOAD_MESSAGES_SUCCESS', this.channelSelect);
            Patcher.unpatchAll();
        }

        getSettingsPanel() {
            reloadSettings();

            return new SettingPanel(() => { PluginUtilities.saveSettings("PiPEmbeds", settings); }, 
                new Switch("Auto-Capture", "Capture picture-in-picture media automatically when the parent message is loaded.", settings.autoCapture, isOn => settings.autoCapture = isOn),
                new Slider("Media Switch Scroll Distance", "How far to scroll over the picture-in-picture window before it switches to the next media source.", 1, 900, settings.scrollStep, val => settings.scrollStep = val, {
                    defaultValue: defaultSettings.scrollStep,
                    markers: Array.from(Array(19).keys()).map((e, i) => i == 0 ? e + 1 : e * 50)
                })
            ).getElement();
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

                for (const attachment of message.attachments) {
                    embedRegistry.set(attachment.id, messageInfo);
                    addedEmbeds.set(attachment.id, messageInfo);
                }

                for (const embed of message.embeds) {
                    embedRegistry.set(embed.id, messageInfo);
                    addedEmbeds.set(embed.id, messageInfo);
                }
            }

            Dispatcher.dispatch({
                type: 'PIP_EMBED_ID_UPDATE',
                added: addedEmbeds
            });
        }
    }
}