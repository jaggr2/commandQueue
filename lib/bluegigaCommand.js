/**
 * Created by roger on 4/3/15.
 */
var debug = require('debug')('bgcommand'),
    libCommandQueue = require('./commandQueue'),
    bg = require('bglib');

var bglib = new bg();

var bgCommand = function(command, params) {
    var self = this;
    self.command = command;
    self.params = params;
    self.commandPacket = null;
    self.response = null;
    self.awaitFollowingCompletedEvent = false;
    self.lastError = null;

    self.getInfo = function() {

        for(var key in bg.api) {
            if (bg.api.hasOwnProperty(key)) {

                if(bg.api[key] == self.command) {
                    return key;
                }
            }
        }

        return "UNKNOWN";
    }

    self.verify = function (callback) {
        bglib.getPacket(self.command, self.params, function (err, packet) {

            if (err) {
                return callback(err);
            }

            self.commandPacket = packet;
            callback(null);
        });
    };

    self.getRawDataToWrite = function () {
        return self.commandPacket ? self.commandPacket.getByteArray() : null;
    };
    self.getParsedData = function () {
        return (self.response ? self.response.response : null);
    };

    self.mapPacket = function (packet) {

        if (self.commandPacket == null) {
            return libCommandQueue.processReturnCodes.FAILURE_FINISHED;
        }

        if(self.awaitFollowingCompletedEvent && packet.responseType === "Event" && self.commandPacket.cClass == packet.packet.cClass) {

            switch (self.command) {

                case bg.api.attClientFindInformation:
                case bg.api.attClientReadByGroupType:
                case bg.api.attClientAttributeWrite:

                    if(packet.packet.cID == 1) { // 1 = procedure completed
                            self.response.response.result = packet.response.result;
                            return libCommandQueue.processReturnCodes.SUCCESSFULLY_FINISHED;
                    }

                    break;

                case bg.api.attClientReadByHandle:

                    switch(packet.packet.cID) {
                        case 5: // 5 = read successfull
                            self.response.response.readData = packet.response;
                            return libCommandQueue.processReturnCodes.SUCCESSFULLY_FINISHED;

                        case 1: // 1 = read completed with error
                            self.response.response.result = packet.response.result;
                            self.lastError = "read completed with error";
                            return libCommandQueue.processReturnCodes.FAILURE_FINISHED;
                    }

                    break;
            }
        }

        if (packet.responseType === "Response" && packet.packet.cClass == self.commandPacket.cClass && packet.packet.cID == self.commandPacket.cID) {
            self.response = packet;

            if(packet.response.result && packet.response.result.detail) {
                self.lastError = packet.response.result.detail;
                return libCommandQueue.processReturnCodes.FAILURE_FINISHED;
            };

            switch (self.command) {

                case bg.api.attClientAttributeWrite:
                case bg.api.attClientReadByGroupType:
                case bg.api.attClientFindInformation:
                case bg.api.attClientReadByHandle:
                    self.awaitFollowingCompletedEvent = true;
                    return libCommandQueue.processReturnCodes.AWAIT_MORE_DATA;

                default:
                    return libCommandQueue.processReturnCodes.SUCCESSFULLY_FINISHED;
            }
        }

        //if(packet.responseType !== "Response") {
            return libCommandQueue.processReturnCodes.IS_ASYNC_DATA;
        //}

        //return libCommandQueue.processReturnCodes.UNKNOWN_PACKET;
    };
};

var bgProcessData = function (buffer, emitToQueue) {
    bglib.parseIncoming(buffer, function(err, parsedPackets) {

        if(err) {
            return console.log(err);
        }

        if(parsedPackets.length == 0 ) {
            return;
        }

        for(var i = 0; i < parsedPackets.length; i++) {

            emitToQueue.emit('packet', parsedPackets[i]);
        }
    });
};

module.exports = {  bgCommand: bgCommand,
    bgProcessData: bgProcessData };
