
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
    this.dimensions = {};
    this.dimensions.mother = new Vec2(
            this.el.clientWidth,
            this.el.clientHeight
    );
    if (ChildContent.prototype.dimensions){
        this.dimensions.child = new Vec2(
            ChildContent.prototype.dimensions.x,
            ChildContent.prototype.dimensions.y
        );
    } else {
        this.dimensions.child = new Vec2(200, 300);
    }
    this.dimensions.inView = Math.ceil(this.dimensions.mother.x / this.dimensions.child.x);
    this.leftBorder = -(this.dimensions.inView * this.dimensions.child.x) -100;
    this.rightBorder = (2 * this.dimensions.inView) * this.dimensions.child.x;

    this.initiated = false;
    this.isDecelerating = false;

    // details about interactions
    this.interaction = {
        start       : new Vec2(), // initial point at touch / mouse start
        current     : new Vec2(), // latest point
        previous    : new Vec2(), // previous point
        context     : new Vec2()  // context for decelleration
    };
    this.deltas = {
        distance    : new Vec2(0,0), // distance tavelled since beginning
        children    : new Vec2(0,0), // children travelled since beginning
        currentMove : new Vec2()    // delta from previous to current
    };
    this.render();
}
Mother.prototype = {
    loadDelay: 300,
    render: function(){
        this._populate();
        this._bind(startEv);
    },
    _populate: function(){
        var child;
        this.children = [];
        for (var i = 0; i < this.dimensions.inView * 3; i++) {
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
    _setPosition: function(v){
        var i = this.interaction,
            d = this.deltas
        ;

        // update interaction details
        i.previous.copy(i.current);
        i.current.copy(v);
        i.current.time = Date.now();

        // update deltas
        d.currentMove.copy(i.current.getMinus(i.previous)),
        d.distance.plus(d.currentMove.getMultiply({ x: -1, y: -1}));
        d.children.set(
            Math.ceil(d.distance.x / this.dimensions.child.x),
            0
        );
    },
    _start: function(e){
        var i = this.interaction,
            point = hasTouch ? e.touches[0] : e
        ;
        e.preventDefault();

        // reset existing movements
        if (this.initiated) return;
        this.initiated = true;

        this._delayLoad();

        // set interaction details
        i.start.set(point.pageX, point.pageY);
        i.start.time = e.timeStamp || Date.now();
        i.context.copy(i.start);
        i.context.time = i.start.time;

        i.current.copy(i.start);

        this._bind(moveEv, document);
        this._bind(endEv, document);
        this._bind(cancelEv, document);
    },
    _move: function(e){
        var that = this,
            i = this.interaction,
            d = this.deltas,
            point = hasTouch ? e.touches[0] : e,
            timestamp = e.timeStamp || Date.now()
        ;

        this._setPosition(new Vec2(point.pageX, point.pageY));
        this._updateChildren();
        this._delayLoad();

        if ( timestamp - i.context.time > 300 ) {
            i.context.time = timestamp;
            i.context.copy(i.current);
        }

    },
    _end: function (e) {
        if ( hasTouch && e.changedTouches.length > 1 ) return;

        var i = this.interaction,
            timestamp = e.timeStamp || Date.now(),
            duration  = timestamp - i.context.time
        ;

        // probably just a click
        if (duration < 300){
            newX = destination(i.current.x - i.context.x, duration);
            this._momentum(
                i.current.x + newX.distance,
                newX.duration
            );
        } else {
            this._load();
        }

        // clean up
        this.initiated = false;
        this._unbind(moveEv, document);
        this._unbind(endEv, document);
        this._unbind(cancelEv, document);
    },
    _momentum: function (destX, duration) {
        var i = this.interaction,
            startTime = Date.now(),
            startX = i.current.x,
            that = this;

        function frame () {
            var now = Date.now(),
                newX,
                easeOut;

            if ( now >= startTime + duration ) {
                that.isDecelerating = false;
                that._setPosition(new Vec2(destX, 0));
                that._load();
                return;
            }

            now = (now - startTime) / duration;
            easeOut = Math.sqrt(1 - ( --now * now ));
            newX = (destX - startX) * easeOut + startX;

            that._setPosition(new Vec2(newX, 0));
            that._updateChildren();

            if ( that.isDecelerating ) requestFrame(frame);
        }

        this.isDecelerating = true;
        frame();
    },

    _delayLoad: function(delay){
        var that = this;
        clearTimeout(this._loadTimeout);
        this._loadTimeout = null;
        this._loadTimeout = setTimeout(function () { that._load(); }, delay || this.loadDelay);
    },
    _load: function(){
        for (var i = 0; i < this.children.length; i++) {
            this.children[i]._load();
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
            child._movePos(this.deltas.currentMove);
        }

        // do the swapping
        if (firstChild.pos.x < this.leftBorder){
            firstChild = this.children.shift();
            firstChild.clean();
            this.children.push(firstChild);
            swapChild = firstChild;
        }
        if (lastChild.pos.x > this.rightBorder){
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
            child._setSlot(i);
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

    // style
    translateStyle: function(){
        // we're only interested in the x axis at the moment
        return 'translate(' + this.x + 'px, 0px)' + translateZ;
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
        this._setSlot(slot);
        this._updateOrigin();
        this.updateStyle();
        this.render();
        this._load();
    },
    _updateOrigin: function(){
        this.deltas.origin.set(
            this.mother.deltas.children.x + this.slot-this.mother.dimensions.inView,
        0);
    },
    _load: function(){
        this.content.load();
    },
    _setSlot: function(slot){
        var delta,
            prevSlot = this.slot,
            prevDelta = this.pos ? this.deltas.slot.clone() : null,
            moved
        ;

        this.slot = slot;
        this.deltas.slot.set((this.slot-this.mother.dimensions.inView) * this.dimensions.x, 0);

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
    _movePos: function(delta){
        this.pos.plus(delta);
        this.updateStyle();
    },

    loading: function(on){
        this.el.className = 'mother__child'+ (on === false ? '' : ' mother__child--loading');
        return this;
    },
    render: function(){
        this.content = new this.mother.ChildContent(this.mother, this);
        this.content.render();
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

function destination (distance, time) {
    var speed = Math.abs(distance) / time,
        friction = 0.0025;

    distance = ( speed * speed ) / ( 2 * friction ) * ( distance < 0 ? -1 : 1 );
    time = speed / friction;

    return { distance: Math.round(distance), duration: Math.round(time) };
}

function prefixStyle(style) {
    if ( vendor === '' ) return style;

    style = style.charAt(0).toUpperCase() + style.substr(1);
    return vendor + style;
}





// expose global
window.Mother = Mother;

}.call(this);