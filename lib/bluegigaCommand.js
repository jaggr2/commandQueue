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
    self.awaitDataCID = -1;

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

        if(self.awaitDataCID >= 0 && self.commandPacket.cClass == packet.packet.cClass) {
            switch(packet.packet.cID) {
                case 5: // bei bg.api.attClientReadByHandle kommt nur eine Antwort, kein Procedure completed
                    self.response.response.readData = packet.response;
                    return libCommandQueue.processReturnCodes.SUCCESSFULLY_FINISHED;

                case self.awaitDataCID:
                    if(!self.response.response.resultList) self.response.response.resultList = [];

                    self.response.response.resultList.push(packet.response);
                    return libCommandQueue.processReturnCodes.AWAIT_MORE_DATA;
                case 1: // 1 = procedure completed
                    self.response.response.result = packet.response.result;
                    return libCommandQueue.processReturnCodes.SUCCESSFULLY_FINISHED;
            }
        }

        if(packet.responseType !== "Response") {
            return libCommandQueue.processReturnCodes.IS_ASYNC_DATA;
        }

        if (packet.packet.cClass == self.commandPacket.cClass && packet.packet.cID == self.commandPacket.cID) {
            self.response = packet;

            switch (self.command) {
                case bg.api.attClientAttributeWrite:
                    self.awaitDataCID = 10000;
                    return libCommandQueue.processReturnCodes.AWAIT_MORE_DATA;


                case bg.api.attClientReadByGroupType:

                    self.awaitDataCID = 2;
                    return libCommandQueue.processReturnCodes.AWAIT_MORE_DATA;


                case bg.api.attClientFindInformation:
                    self.awaitDataCID = 4;
                    return libCommandQueue.processReturnCodes.AWAIT_MORE_DATA;


                case bg.api.attClientReadByHandle:
                    self.awaitDataCID = 5;
                    return libCommandQueue.processReturnCodes.AWAIT_MORE_DATA;

                default:
                    return libCommandQueue.processReturnCodes.SUCCESSFULLY_FINISHED;
            }
        }



        return libCommandQueue.processReturnCodes.UNKNOWN_PACKET;
    };
};

var bgProcessData = function (buffer, emitToQueue) {
    bglib.parseIncoming(buffer, function(err, parsedPackets) {

        if(err) {
            return debug(err);
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