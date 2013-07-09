
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
    this.listeners = {};

    this.el = typeof el === 'string' ? document.querySelector(el) : el;
    this.ChildContent = ChildContent;

    this.initiated = false;
    this.isDecelerating = false;

    this._setDimensions();

    // details about interactions
    this.interaction = {
        start       : new Vec2(), // initial point at touch / mouse start
        current     : new Vec2(), // latest point
        previous    : new Vec2(), // previous point
        context     : new Vec2()  // context for decelleration
    };
    this.deltas = {
        swap        : -this.dimensions.inView, // swap diff from beginning
        distance    : new Vec2(0,0), // distance tavelled since beginning
        currentMove : new Vec2()     // delta from previous to current
    };
    this.render();
}
Mother.prototype = {

    loadDelay        : 300,
    triggerDistance  : 10,
    maxSpeed         : 3,
    maxPast          : false, // eg -15 = stop loading children at -15 origin
    maxFuture        : false, // eg  15 = stop loading children at 15 origin

    render: function(){
        this._populate();
        this._bind(startEv);
    },
    _setDimensions: function(){

        // container dimensions
        this.dimensions = {};
        this.dimensions.mother = new Vec2(
                this.el.clientWidth,
                this.el.clientHeight
        );

        // Child dimensions
        if (this.ChildContent.prototype.dimensions){
            this.dimensions.child = new Vec2(
                this.ChildContent.prototype.dimensions.x,
                this.ChildContent.prototype.dimensions.y
            );
        } else {
            this.dimensions.child = new Vec2(200, 300);
        }

        // how many children can be visible at one time
        this.dimensions.inView = Math.ceil(this.dimensions.mother.x / this.dimensions.child.x);

        // the point at which we need to do some swaps
        this.boundary = {
            left: -(this.dimensions.inView * this.dimensions.child.x) -100,
            right: (2 * this.dimensions.inView) * this.dimensions.child.x
        };
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
    _setPosition: function(x){
        var i = this.interaction,
            d = this.deltas
        ;

        // update interaction details
        i.previous.copy(i.current);
        i.current.set(x, 0);
        i.current.time = Date.now();

        // update deltas
        d.currentMove.copy(i.current.Minus(i.previous)),
        d.distance.plus(d.currentMove.Mult(-1));
        this._trigger('position.set');
    },
    _start: function(e){
        var i = this.interaction,
            point = hasTouch ? e.touches[0] : e
        ;

        // reset existing movements
        if (this.initiated) return;
        this.initiated = true;
        e.preventDefault();

        this._delayLoad();

        if ( this.isDecelerating ) {
            this.isDecelerating = false;
            this._setPosition(i.current.x);
        }

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

        this._setPosition(point.pageX);
        this._updateChildren();
        this._delayLoad();

        if (Math.abs(d.currentMove.x) < this.triggerDistance){
            this.isMoved = true;
        }

        if ( timestamp - i.context.time > 300 ) {
            i.context.time = timestamp;
            i.context.copy(i.current);
        }

    },
    _end: function (e) {
        if ( hasTouch && e.changedTouches.length > 1 ) return;


        var i = this.interaction,
            timestamp = e.timeStamp || Date.now(),
            duration  = timestamp - i.context.time,
            newX
        ;


        if (!this._bounceToEdge()){
            // inertia slow down
            if (duration < 300){
                newX = this.destination(i.current.x - i.context.x, duration);
                this._momentum(
                    i.current.x + newX.distance,
                    newX.duration
                );

            } else {
                this._load('end');
            }
        }

        // clean up
        this.initiated = false;
        this._unbind(moveEv, document);
        this._unbind(endEv, document);
        this._unbind(cancelEv, document);
    },
    _momentum: function (destX, duration, isBounce) {
        var i = this.interaction,
            startTime = Date.now(),
            startX = i.current.x,
            that = this;

        function frame () {
            if ( !that.isDecelerating ) return;
            that._delayLoad();

            var now = Date.now(),
                newX,
                easeOut;

            if ( now >= startTime + duration ) {
                that.isDecelerating = false;
                that._setPosition(destX);
                that._load('stop');
                that._trigger('momentum.stop');
                return;
            }

            now = (now - startTime) / duration;
            easeOut = Math.sqrt(1 - ( --now * now ));
            newX = (destX - startX) * easeOut + startX;

            that._setPosition(newX);
            that._updateChildren();

            if (!isBounce){
                if (!that._bounceToEdge()){
                    requestFrame(frame);
                }
            } else {
                requestFrame(frame);
            }
        }

        this.isDecelerating = true;
        frame();
    },
    _bounceToEdge: function(){
        if (this.maxPast || this.maxFuture){
            var i = this.interaction
                firstChild = this.children[0],
                lastChild  = this.children[this.children.length-1]
            ;

            // bounce back if at ends
            if (firstChild.pos.x > 0){
                this._momentum(
                    i.current.x - firstChild.pos.x,
                    500, true
                );
                return true;

            } else if (lastChild.pos.x < this.dimensions.mother.x - this.dimensions.child.x){
                this._momentum(
                    i.current.x + (this.dimensions.mother.x - this.dimensions.child.x - lastChild.pos.x),
                    500, true
                );
                return true;
            }
        }
    },

    /**
     * Check whether we are at the maxPast or maxFuture
     * so that we stop future swapping
     */
    _atMax: function(){
        this.atMaxPast = this.maxPast ? this.deltas.swap <= this.maxPast : false;
        this.atMaxFuture = this.maxFuture ? this.children.length + this.deltas.swap > this.maxFuture : false;
    },

    /**
     * Update the positions of each child and swap children
     * from front to back etc if needed
     */
    _updateChildren: function(){
        var child,
            firstChild = this.children[0],
            lastChild  = this.children[this.children.length-1],
            swapChild
        ;

        // bounce back if at ends
        // if (firstChild.pos.x > 0){
        //     this.deltas.currentMove.multiply(0.3);
        // }
        // if (lastChild.pos.x < this.dimensions.mother.x - this.dimensions.child.x){
        //     this.deltas.currentMove.multiply(0.3);
        // }

        // move children
        for (var i = 0; i < this.children.length; i++) {
            child = this.children[i];
            child._movePos(this.deltas.currentMove);
        }


        // do the swapping
        if (!this.atMaxPast){
            if (lastChild.pos.x > this.boundary.right){
                this.pop();
            }
        }
        if (!this.atMaxFuture){
            if (firstChild.pos.x < this.boundary.left){
                this.shift();
            }
        }
    },
    /**
     * Shift a child from the beginning of the stack
     * and place it at the end
     */
    shift: function(){
        var firstChild = this.children.shift();
        firstChild.clean();
        this.children.push(firstChild);
        this.deltas.swap++;

        this._updateSlots();
        firstChild._updateOrigin();
        firstChild.loading().render();
        this._atMax();
    },
    /**
     * Pop a child from the end of the stack and
     * place it at the beginning
     */
    pop: function(){
        var lastChild = this.children.pop();
        lastChild.clean();
        this.children.unshift(lastChild);
        this.deltas.swap--;

        this._updateSlots();
        lastChild._updateOrigin();
        lastChild.loading().render();
        this._atMax();
    },
    _updateSlots: function(){
        var child;
        for (var i = 0; i < this.children.length; i++) {
            child = this.children[i];
            child._setSlot(i, i-this.deltas.swap);
            child.updateStyle();
        }
    },

    // Eventing
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
    on: function(eventName, fn){
        this.listeners[eventName] = this.listeners[eventName] || [];
        this.listeners[eventName].push(fn);
        return this;
    },
    _trigger: function(eventName){
        if (this.listeners[eventName]){
            for (var i=0; i < this.listeners[eventName].length; i++){
                this.listeners[eventName][i].call(this);
            }
        }
        return this;
    },

    _delayLoad: function(delay){
        var that = this;
        clearTimeout(this._loadTimeout);
        this._loadTimeout = null;
        this._loadTimeout = setTimeout(function () { that._load('delayed'); }, delay || this.loadDelay);
    },
    _load: function(trigger){
        clearTimeout(this._loadTimeout);
        this._loadTimeout = null;

        for (var i = 0; i < this.children.length; i++) {
            this.children[i]._load(trigger);
        }
        this._trigger('load');
    },
    destination: function(distance, time) {
        var speed = Math.min(Math.abs(distance) / time, this.maxSpeed),
            friction = 0.0025
        ;
        distance = ( speed * speed ) / ( 2 * friction ) * ( distance < 0 ? -1 : 1 );
        time = speed / friction;

        return {
            distance: Math.round(distance),
            duration: Math.round(time)
        };
    }
};

/**
 * Simple 2 dimensional Vector
 */
var Vec2 = Mother.Vec2 = function(x,y) {
    this.listeners = [];
    this.set(x, y);
};
Vec2.prototype = {
    on: Mother.prototype.on,
    _trigger: Mother.prototype._trigger,
    set: function(x, y){
        this.x = x;
        this.y = y;
        this._trigger('set');
        return this;
    },
    copy: function(v){
        return this.set(v.x, v.y);
    },
    clone: function(){
        var v = new Vec2();
        return v.copy(this);
    },
    equals: function(v){
        return this.x === v.x && this.y === v.y;
    },
    plus: function(v){
        return this.set(
            this.x+v.x,
            this.y+v.y
        );
    },
    minus: function(v){
        return this.set(
            this.x-v.x,
            this.y-v.y
        );
    },
    multiply: function(v){
        return this.set(
            this.x* (v.x || v),
            this.y* (v.y || v)
        );
    },
    mod: function(v){
        return this.set(
            this.x % v.x,
            this.y % v.y
        );
    },

    // functions which don't change the object
    Minus: function(v){
        return this.clone().minus(v);
    },
    Mult: function(v){
        return this.clone().multiply(v);
    },
    Mod: function(v){
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
    on: Mother.prototype.on,
    _trigger: Mother.prototype._trigger,

    _initialize: function(slot, mother){
        var that = this;

        this.listeners = [];
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

    /**
     * Update how far we have travelled from the first slot
     * visible inside the window
     *
     * @return {[type]} [description]
     */
    _updateOrigin: function(){
        this.deltas.origin.set(
            this.slot + this.mother.deltas.swap,
        0);
    },
    _load: function(){
        this.content.load();
    },
    /**
     * When the child is moved to the back or the front we tell it
     * what slot in the array it is now holding and how far it has
     * travelled from the first set on load
     *
     * @param  {number} slot The current slot in the array
     */
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
            moved = this.pos.Minus(prevDelta).Mod(this.dimensions);
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

function prefixStyle(style) {
    if ( vendor === '' ) return style;

    style = style.charAt(0).toUpperCase() + style.substr(1);
    return vendor + style;
}





// expose global
window.Mother = Mother;

}.call(this);