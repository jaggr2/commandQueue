/**
 * Created by roger on 4/3/15.
 */
var debug = require('debug')('commandqueue'),
    Moment = require('moment'),
    events = require('events');

var processReturnCodes = {
    IS_ASYNC_DATA: 3,
    AWAIT_MORE_DATA: 2,
    SUCCESSFULLY_FINISHED: 1,
    UNKNOWN_PACKET:   0,
    FAILURE_FINISHED: -1
};

var abstractCommand = function(command) {
    var self = this;
    self.command = command;
    self.response = null;

    self.verify = function (callback) {
        callback(null);
    };

    self.getRawDataToWrite = function () {
        return self.command;
    };
    self.getParsedData = function () {
        return self.response ;
    };

    self.mapPacket = function (packet) {
        if(packet) {
            self.response = packet;
            return processReturnCodes.SUCCESSFULLY_FINISHED;
        }

        return processReturnCodes.FAILURE_FINISHED;
    };
};

var commandQueue = function (config) {

    var self = this;

    events.EventEmitter.call(this);

    self.config = {};
    self.config.eventParams = (config.eventParams ? config.eventParams : null);

    self.queue = [];

    self.addCommand = function (newCommand, timeoutInMilliseconds, callback) {

        if (newCommand) {
            /* todo: check if newCommand has the nessesary functions
            if (!newCommand.isValid()) {
                callback('invalid command', newCommand);
            } */

            var commandContainer = {
                sentTime: null,
                finishedTime: null,
                timeoutInMilliseconds: ( timeoutInMilliseconds ? timeoutInMilliseconds : 30000 ),
                duration: null,
                command: newCommand,
                callback: callback,
                sentTimerRef: null,
                isVerified: false
            };

            self.queue.push(commandContainer);

            debug('added to queue: ', commandContainer);

            self.processNextCommand();

        }
        else {
            callback('command must not be null', newCommand);
        }
    };

    self.processNextCommand = function () {
        if (self.queue.length == 0) {
            // return on empty queue
            return;
        }

        var commandObject = self.queue[0];

        if (commandObject.sentTime) {
            // Currently a command is executing, wait until that command finishes
            return;
        }

        commandObject.sentTime = Moment();

        commandObject.sentTimerRef = setTimeout(function (commandObj) {
            // if the result is still null, then we didn't get a response
            // in this case quit the command from the queue
            if (!commandObj.finishedTime) {

                for (var i = 0; i < self.queue.length; i++) {
                    if (self.queue[i] == commandObj) {
                        self._quitCommands("Timeout while waiting for data for command", i, 1);
                        return;
                    }
                }

                self.emit('timeout', commandObj, self.config.eventParams);
            }
        }, commandObject.timeoutInMilliseconds, commandObject);

        debug('verify and send command: ', commandObject);

        // TODO: do verify already on adding to the queue. Needs also a verify timeout handler
        commandObject.command.verify(function(err) {

            if(err) {
                self._quitCommands(err, 0, 1);
            }
            else {
                self.emit('write', commandObject.command.getRawDataToWrite(), self.config.eventParams);
            }
        })
    };

    self._quitCommands = function (err, startIndex, count) {
        // Remove the desired commands from the quie
        var commands = self.queue.splice(startIndex, count);

        for (var i = 0; i < commands.length; i++) {

            var commandObject = commands[i];

            // clear Timer and set finishedTime
            if (commandObject.sendTimer) {
                clearTimeout(self.sendTimer);
            }

            commandObject.finishedTime = Moment();
            commandObject.duration = commandObject.sentTime ? commandObject.finishedTime.diff(commandObject.sentTime) : null;

            if(err) {
                debug('quit command with err: ', err, commandObject);
            }
            else {
                debug('quit command with success: ', commandObject);
            }

            commandObject.callback(err, commandObject, (!err ? commandObject.command.getParsedData() : null));
        }

        self.processNextCommand();
    };

    self.mapPacket = function(parsedPacket) {

        for (var i = 0; i < self.queue.length; i++) {

            switch (self.queue[i].command.mapPacket(parsedPacket)) {
                case processReturnCodes.AWAIT_MORE_DATA:
                    debug('processData-> ', 'AWAIT_MORE_DATA', parsedPacket);
                    return true;

                case processReturnCodes.SUCCESSFULLY_FINISHED:
                    debug('processData-> ', 'SUCCESSFULLY_FINISHED', parsedPacket);
                    self._quitCommands(null, i, 1);
                    return true;

                case processReturnCodes.IS_ASYNC_DATA:
                    i = self.queue.length; // break the loop
                    break;
            }

        }

        debug('processData-> ', 'ASYNC_DATA', parsedPacket);
        return self.emit('asyncPacket', parsedPacket, self.config.eventParams );
    };

    self.on('packet', self.mapPacket);


    self.quitAllCommands = function (err) {
        self._quitCommands(( err ? err : "quitAllCommands was called"), 0, self.queue.length - 1);
    };
};
commandQueue.prototype.__proto__ = events.EventEmitter.prototype;


/* example data processing function
var processStringData = function(stringOrBuffer) {
    if (S(stringOrBuffer).isEmpty()) return;

    var parsedPackets = stringOrBuffer.split("\n");

    for(var j = 0; j < parsedPackets.length; j++) {
        commandQueue.emit('packet', parsedPackets[j]);
    }
};
*/


module.exports = {  commandQueue: commandQueue,
                    processReturnCodes: processReturnCodes,
                    abstractCommand: abstractCommand };