
/**
 * mother.js
 * Infinite scrolling of children within a window.
 * Graciously handles births and deaths.
 *
 * heavily influenced by <https://github.com/cubiq/infiniwall>
 */

!function(){

/**
 * Main Constructor
 */
function Mother(el, ChildContent) {

    this.el = typeof el === 'string' ? document.querySelector(el) : el;
    this.ChildContent = ChildContent;

    // container dimensions
    this.dimensions = {
        mother: new Vec2(
            this.el.offsetWidth,
            this.el.offsetHeight
        ),
        child: new Vec2(200, 0)
    };

    this.initiated = false;
    this.isDecelerating = false;

    // details about interactions
    this.interaction = {
        start       : new Vec2(), // initial point at touch / mouse start
        current     : new Vec2(), // latest point
        previous    : new Vec2(), // previous point
        context      : new Vec2()  // context for decelleration
    };
    this.deltas = {
        distance    : new Vec2(0,0), // distance tavelled since beginning
        children    : new Vec2(0,0), // children travelled since beginning
        currentMove : new Vec2()    // delta from previous to current
    };

    this._populate();

    this._bind(startEv);

}
Mother.prototype = {
    _populate: function(){
        var child;
        this.children = [];
        for (var i = 0; i < 9; i++) {
            child = new Child(i, this);
            this.children.push(child);
            this.el.appendChild(child.el);
        }
    },
    handleEvent: function(e){
        switch ( e.type ) {
            case startEv:
                if ( !hasTouch && e.button !== 0 ) return;
                this._start(e);
                break;
            case moveEv:
                this._move(e);
                break;
            case endEv:
            case cancelEv:
                this._end(e);
                break;
            case resizeEv:
                this._resize();
                break;
            case transitionEndEv:
                this._transitionEnd(e);
                break;
        }
    },
    _bind: function (type, el, bubble) {
        (el || this.el).addEventListener(type, this, !!bubble);
    },
    _unbind: function (type, el, bubble) {
        (el || this.el).removeEventListener(type, this, !!bubble);
    },
    _start: function(e){
        var point = hasTouch ? e.touches[0] : e
        ;
        e.preventDefault();

        // reset existing movements
        if ( this.initiated ) return;
        this.initiated = true;

        clearTimeout(this._loadTimeout);
        this._loadTimeout = null;


        // set interaction details
        this.interaction.start.set(point.pageX, point.pageY);
        this.interaction.start.time = e.timeStamp || Date.now();
        this.interaction.context.copy(this.interaction.start);
        this.interaction.context.time = this.interaction.start.time;

        this.interaction.current.copy(this.interaction.start);

        this._bind(moveEv, document);
        this._bind(endEv, document);
        this._bind(cancelEv, document);
    },
    _move: function(e){
        var that = this,
            point = hasTouch ? e.touches[0] : e,
            timestamp = e.timeStamp || Date.now()
        ;

        clearTimeout(this._loadTimeout);
        this._loadTimeout = null;

        // update interaction details
        this.interaction.previous.copy(this.interaction.current);
        this.interaction.current.set(point.pageX, point.pageY);
        this.interaction.current.time = e.timeStamp || Date.now();

        // update deltas
        this.deltas.currentMove = this.interaction.current.getMinus(this.interaction.previous),
        this.deltas.distance.plus(this.deltas.currentMove.getMultiply({ x: -1, y: -1}));
        this.deltas.children.set(
            Math.ceil(this.deltas.distance.x / this.dimensions.child.x),
            Math.ceil(this.deltas.distance.y / this.dimensions.child.y)
        );



        this._updateChildren();

        if ( timestamp - this.interaction.context.time > 300 ) {
            this.interaction.context.time = timestamp;
            this.interaction.context.copy(this.interaction.current);

            this._loadTimeout = setTimeout(function () { that._load(); }, 100);
        }

    },
    _end: function (e) {
        if ( hasTouch && e.changedTouches.length > 1 ) return;

        clearTimeout(this._loadTimeout);
        this._loadTimeout = null;

        var point = hasTouch ? e.touches[0] : e,
            timestamp = e.timeStamp || Date.now(),
            duration  = timestamp - this.interaction.context.time
        ;

        // probably a click
        if (duration < 300){
            console.log('duration < 300');

        // otherwise we have probably moved
        } else {
            this._load();
        }

        // clean up
        this.initiated = false;
        this._unbind(moveEv, document);
        this._unbind(endEv, document);
        this._unbind(cancelEv, document);
    },

    _load: function(){
        for (var i = 0; i < this.children.length; i++) {
            this.children[i].load();
        }
    },
    _updateChildren: function(){
        var child,
            firstChild = this.children[0],
            lastChild  = this.children[this.children.length-1],
            swapChild
        ;


        // move children
        for (var i = 0; i < this.children.length; i++) {
            child = this.children[i];
            child.movePos(this.deltas.currentMove);
        }

        // do the swapping
        if (firstChild.pos.x < -700){
            firstChild = this.children.shift();
            firstChild.clean();
            this.children.push(firstChild);
            swapChild = firstChild;
        }
        if (lastChild.pos.x > 1200){
            lastChild = this.children.pop();
            lastChild.clean();
            this.children.unshift(lastChild);
            swapChild = lastChild;
        }
        if (swapChild){
            this._updateSlots();
            swapChild._updateOrigin();
            swapChild.loading().render();
        }

    },
    _updateSlots: function(){
        var child;
        for (var i = 0; i < this.children.length; i++) {
            child = this.children[i];
            child.setSlot(i);
            child.updateStyle();
        }
    }
};

/**
 * Simple 2 dimensional Vector
 */
var Vec2 = Mother.Vec2 = function(x,y) {
    this.set(x, y);
};
Vec2.prototype = {
    set: function(x, y){
        this.x = x;
        this.y = y;
        return this;
    },
    copy: function(v){
        this.x = v.x;
        this.y = v.y;
        return this;
    },
    clone: function(){
        var v = new Vec2();
        v.copy(this);
        return v;
    },
    equals: function(v){
        return this.x === v.x && this.y === v.y;
    },
    plus: function(v){
        this.x+=v.x;
        this.y+=v.y;
        return this;
    },
    minus: function(v){
        this.x-=v.x;
        this.y-=v.y;
        return this;
    },
    multiply: function(v){
        this.x*=v.x;
        this.y*=v.y;
        return this;
    },
    mod: function(v){
        this.x = this.x % v.x;
        this.y = this.y % v.y;
        return this;
    },

    // functions which don't change the object
    getMinus: function(v){
        return this.clone().minus(v);
    },
    getMultiply: function(v){
        return this.clone().multiply(v);
    },
    getMod: function(v){
        return this.clone().mod(v);
    },

    // for readability
    width: function(){
        return this.x;
    },
    height: function(){
        return this.h;
    },

    // style
    translateStyle: function(){
        // we're only interested in the x axis at the moment
        return 'translate(' + this.x + 'px,' + 0 + 'px)' + translateZ;
    }
};

/**
 * Child Container
 */
var Child = Mother.Child = function(slot, mother){
    this._initialize(slot, mother);
};
Child.prototype = {

    _initialize: function(slot, mother){
        var that = this;

        this.el = document.createElement('div');
        this.mother = mother;
        this.dimensions = this.mother.dimensions.child;

        // defaults
        this.deltas = {
            slot   : new Vec2(0,0),
            origin : new Vec2(0,0)
        };

        this.loading();
        this.setSlot(slot);
        this._updateOrigin();
        this.updateStyle();
        this.render();
        this.load();
    },
    _updateOrigin: function(){
        this.deltas.origin.set(this.mother.deltas.children.x + this.slot-3, 0);
    },
    loading: function(on){
        this.el.className = 'mother__child'+ (on === false ? '' : ' mother__child--loading');
        return this;
    },
    setSlot: function(slot){
        var delta,
            prevSlot = this.slot,
            prevDelta = this.pos ? this.deltas.slot.clone() : null,
            moved
        ;

        this.slot = slot;
        this.deltas.slot.set((this.slot-3) * this.dimensions.x, 0);

        if (!this.pos){
            this.pos = new Vec2();
            this.pos.set(
                this.deltas.slot.x,
                0
            );
        } else {
            moved = this.pos.getMinus(prevDelta).getMod(this.dimensions);
            if (moved.x < 0){
                moved.plus(this.dimensions);
            }
            this.pos.set(
                this.deltas.slot.x + moved.x,
                0
            );
        }

    },
    movePos: function(delta){
        this.pos.plus(delta);
        this.updateStyle();
    },
    render: function(){
        this.content = new this.mother.ChildContent(this.mother, this);
        this.content.render();
    },
    load: function(){
        this.content.load();
    },
    clean: function(){
        this.content.clean();
        this.content = null;
    },
    updateStyle: function(){
        this.el.style[transform] = this.pos.translateStyle();
    }
};

// ---------------------------------------------
// CROSS BROWSER SETUP
// ---------------------------------------------

var dummyStyle = document.createElement('i').style,
    vendor = (function () {
        var vendors = 't,webkitT,MozT,msT,OT'.split(','),
            t,
            i = 0,
            l = vendors.length;

        for ( ; i < l; i++ ) {
            t = vendors[i] + 'ransform';
            if ( t in dummyStyle )
                return vendors[i].substr(0, vendors[i].length - 1);
        }

        return false;
    })(),
    cssVendor = vendor ? '-' + vendor.toLowerCase() + '-' : '',

    // Style properties
    transform = prefixStyle('transform'),
    transitionProperty = prefixStyle('transitionProperty'),
    transitionDuration = prefixStyle('transitionDuration'),
    transitionTimingFunction = prefixStyle('transitionTimingFunction'),
    transitionDelay = prefixStyle('transitionDelay'),

    // Browser capabilities
    has3d = prefixStyle('perspective') in dummyStyle,
    hasTouch = 'ontouchstart' in window,
    hasTransitionEnd = prefixStyle('transition') in dummyStyle,

    // Device detect
    isAndroid = (/android/i).test(navigator.appVersion),

    resizeEv = 'onorientationchange' in window ? 'orientationchange' : 'resize',
    startEv = hasTouch ? 'touchstart' : 'mousedown',
    moveEv = hasTouch ? 'touchmove' : 'mousemove',
    endEv = hasTouch ? 'touchend' : 'mouseup',
    cancelEv = hasTouch ? 'touchcancel' : 'mouseup',
    transitionEndEv = (function () {
        if ( vendor === false ) return false;

        var transitionEnd = {
                ''          : 'transitionend',
                'webkit'    : 'webkitTransitionEnd',
                'Moz'       : 'transitionend',
                'O'         : 'otransitionend',
                'ms'        : 'MSTransitionEnd'
            };

        return transitionEnd[vendor];
    })(),

    // Helpers
    requestFrame =  window.requestAnimationFrame ||
                    window.webkitRequestAnimationFrame ||
                    window.mozRequestAnimationFrame ||
                    window.msRequestAnimationFrame ||
                    window.oRequestAnimationFrame ||
                    function (callback) { return setTimeout(callback, 1); },
    translateZ = has3d ? ' translateZ(0)' : ''

;

function prefixStyle(style) {
    if ( vendor === '' ) return style;

    style = style.charAt(0).toUpperCase() + style.substr(1);
    return vendor + style;
}





// expose global
window.Mother = Mother;

}.call(this);