/*
 * Copyright 2011 eBay Software Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var eventTypes = require('./event-types.js'),
    _ = require('underscore'),
    uuid = require('node-uuid'),
    events = require("events"),
    util = require('util');

/**
 * The point of this emitter is to capture events in a hierarchy so know which part of the script
 * caused what HTTP request.
 *
 * Each event emitted has the following fields:
 *
 * - id: An event ID
 * - parentId: ID of the parent event
 * - startTime: begin time of the event
 * - tx: event type (begin, end, info, error, warn)
 * - type: app level type ------- TODO: we should not need this here.
 * - uuid: A UUID - also used in request-id headers for tracking requests
 */
var LogEmitter = module.exports = function() {
    events.EventEmitter.call(this);

    var counter = 0;
    this.getEventId = function() {
        if (counter == 65535) {
            counter = 1; // skip 0, it means non-transaction
        }
        return ++counter;
    }

    this.endEvent = function(event, message) {
        if (!event) {
            return; // don't waste my time
        }

        var startTime = event.startTime || getUTimeInSecs();

        try {
            event.duration = Date.now() - startTime;
        }
        catch(e) {
            event.txDuration = 0;
        }

        event.tx = 'end';

        this.emit(eventTypes.END_EVENT, event, message); //end
    }

    this.beginEvent = function() {
        var parent = arguments[0].parent;
        var type = arguments[0].type;
        var name = arguments[0].name;
        var message = _.isObject(message) ? JSON.stringify(arguments[0].message) : arguments[0].message;
        var cb = arguments[0].cb;

        var event = {
            eventId: this.getEventId(),
            parentEventId: (parent ? parent.eventId = parent.eventId || 0 : 0),
            startTime: Date.now(),
            tx: 'begin',
            type: type || 'ql.io',
            name: name || 'ql.io',
            uuid: (parent && parent.uuid ? parent.uuid : uuid())
        };

        this.emit(eventTypes.BEGIN_EVENT, event, message);
        var that = this;
        return {
            event: event,
            cb: function(e, r, m) {
                var status = 'Success';
                if (e) {
                    if(e.emitted === undefined) {
                        event.tx = 'error';
                        that.emit(eventTypes.ERROR, event, e);
                        e.emitted = true;
                    }
                    status = 'Failure'
                }
                that.endEvent(event, m || status);
                return cb(e, r);
            }
        }
    }

    this.emitEvent = function(event, msg){
        event.tx = 'info';
        this.emit(eventTypes.EVENT, event, msg);
    }

    this.emitWarning = function () {
        var event = {}, msg = 'Warning event raised without message';
        if (arguments.length > 1) {
            event = arguments[0];
            msg = arguments[1];
        }
        else if (arguments.length === 1) {
            msg = arguments[0];
        }
        event.tx = 'warn';
        this.emit(eventTypes.WARNING, event, msg);
    }

    this.emitError = function () {
        var event = {}, msg = 'Error event raised without message', cause;
        if (arguments.length > 1) {
            event = arguments[0];
            msg = arguments[1];
            if(msg.stack) {
                cause = msg;
                msg = msg.message;
            }
        }
        else if (arguments.length === 1) {
            msg = arguments[0];
        }
        event.tx = 'error';
        this.emit(eventTypes.ERROR, event, msg, cause);
    }

    function getUTimeInSecs() {
        return Math.floor(new Date().getTime() / 1000);
    }
}

util.inherits(LogEmitter, events.EventEmitter);
