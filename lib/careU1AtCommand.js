/**
 * Created by roger on 4/3/15.
 */

var debug = require('debug')('atCommandParser');
var S = require('string');

/* old code - needs to be rewritten


var parser = {};

parser.parseCommand = function(commandString, newValue, callback)
{
    // validate command
    var i, found = false;

    var commandObj = {};

    var command = commandString.toString().toUpperCase();

    for(i = 0; i < atFormat.CommandList.length && !found; i++) {
        if(atFormat.CommandList[i].isCommand(command)) {
            commandObj.atCommand = atFormat.CommandList[i];
            found = true;
        }
    }

    if(!found) {
        callback("Unknown command");
    }
    else {
        commandObj.outstandingLineCount = self.command.getDataLines() + 1;

        if (newValue !== undefined && newValue !== null) {

            self.newValue = newValue;

            if (_.isObject(newValue)) {

                self.rawNewValue = self.command.getRawStringValue(newValue);

                if (!self.rawNewValue) {
                    self.errortext = "Invalid value for command " + self.command;
                    self.command = null;
                }
            }
            else {
                self.rawNewValue = newValue.toString();

                if (S(self.rawNewValue).isEmpty()) {
                    self.rawNewValue = null;
                    self.newValue = null;
                }
            }
        }

        if(self.newValue != null && self.command.isReadOnly()) {
            self.errortext = "Command " + self.command.config.name + " is a read only command. No new value can be set.";
            self.command = null;
        }
    }
};

parser.isValid = function(commandObj) {
    return !!commandObj;
};


var Command = function(command, responseParser, callback) {

    var self = this;
    self.command = null;
    self.sentTime = null;
    self.finishedTime = null;
    self.rawResponseData = null;
    self.responseParser = responseParser;
    self.callback = callback;

    self.result = false;
    self.responseData = null;
    self.errortext = "";

    self.sentTimer = null;



    this.isValid = function() {
        return self.command != null;
    };

    this.isReadCommand = function() {
        return self.newValue == null;
    };

    this.getCommandString = function() {
        return this.isValid() ? self.command.getCommandString(self.rawNewValue) : '';
    };

    this.setStatusSent = function(timerObject) {
        self.sentTime = Moment();
        self.sendTimer = timerObject;
    };

    this.finishAndCallCallback = function(tracker, errorText) {
        // clear Timer and set finishedTime
        if(self.sendTimer) clearTimeout(self.sendTimer);
        self.finishedTime = Moment();
        var difference = self.sentTime ? self.finishedTime.diff(self.sentTime) : null;

        if(!S(errorText).isEmpty()) self.errortext = errorText;

        if(self.callback) {
            if (self.result) {

                self.result = true; // ensure boolean not null value
                self.responseData = self.command.parseResponse(self, self.rawResponseData);

                self.command.callSuccessHandlers(tracker, self);
                self.callback(null, tracker, self.responseData, difference);
            }
            else {
                self.result = false; // ensure boolean not null value

                if(S(self.errortext).isEmpty()) self.errortext = "Unknown Error happened for command " + self.command;

                self.command.callFailureHandlers(tracker, self);
                self.callback(new Error(self.errortext), tracker, null, difference);
            }
        }
    };

    // return true if one more line is expected, otherwise false
    this.parseLine = function(line)
    {
        var dataLine;
        dataLine = line.toString().match(/^(\$|OK:|ERROR:)([\w\d]+)=?(.*)/i);

        if(!dataLine) {
            console.log("Unknown command data: ", dataLine);
            return atFormat.ATCommandReturnCode.UNKNOWN_DATA;
        }

        dataLine[1] = dataLine[1].toUpperCase();
        dataLine[2] = dataLine[2].toUpperCase();

        if(!self.command.isCommand(dataLine[2])) {
            return atFormat.ATCommandReturnCode.WRONG_COMMAND;
        }

        if(dataLine[1] === "OK:" || dataLine[1] === "ERROR:") {
            // we got a header
            self.result = dataLine[1] === "OK:";
            if(!self.result) self.errortext = "Device returned " + dataLine[1];
        }
        else {
            // we got a data line
            self.rawResponseData.push(dataLine[3]);
        }

        self.outstandingLineCount -= 1;
        return self.outstandingLineCount > 0 ? atFormat.ATCommandReturnCode.AWAIT_MORE_DATA : atFormat.ATCommandReturnCode.SUCCESSFULLY_FINISHED;
    };
};


   socket = {};

    // Identify this client

    socket.commandQueue = [];
    socket.lastTransactionID = 0;


    socket.timeoutCount = 0;

    socket.sendCommand = function (newCommand) {

        if(newCommand) {
            if (newCommand.isValid()) {

                if (!socket.trackerID) {
                    // the Tracker sends a hearbeat after every connect
                    // if trackerID is null, then this heartbeat didn't get in until now
                    newCommand.finishAndCallCallback(socket, "No commands can be sent until initial tracker handshake is done");
                }

                socket.commandQueue.push(newCommand);
            }
            else {
                newCommand.finishAndCallCallback(socket, null);
            }
        }

        if (socket.commandQueue.length == 0) {
            // return on empty queue
            return;
        }

        var commandObject = socket.commandQueue[0];

        if (commandObject.sentTime) {
            // Currently a command is executing, wait until that command finishes
            return;
        }

        var timeoutInSeconds = 20;
        commandObject.setStatusSent(setTimeout(function(commandObj) {
            // if the result is still null, then we didn't get a response
            // in this case quit the command from the queue
            if(!commandObj.finishedTime) {
                socket.timeoutCount += 1;
                if(socket.timeoutCount > 2) {
                    debug("We got more than 2 timeouts, destroy the socket!");
                    socket.destroy();
                }

                for (var i = 0; i < socket.commandQueue.length; i++) {
                    if( socket.commandQueue[i] == commandObj ) {
                        socket._quitCommands("Timeout while waiting for data for command " + commandObj.command, i, 1);
                        return;
                    }
                }
            }
        }, timeoutInSeconds * 1000, commandObject));


        if (socket.isASCIIFormat) {
            socket.write(commandObject.getCommandString());
            debug("Sent to tracker " + socket.trackerID, commandObject.getCommandString());
        }
        else {
            socket.write(atFormat.generateBinaryCommandRequest(socket.lastTransactionID + 1, commandObject.getCommandString()));
            debug("Sent to tracker " + socket.trackerID, commandObject.getCommandString());
        }
    };

    socket._setTrackerID = function(id) {
        var idString = S(id);

        if(!idString.isEmpty() && idString.isNumeric()) {
            var newId = idString.toString();
            var oldId = socket.trackerID;

            var sentConnectedMessage = socket.trackerID == 0 || socket.trackerID == null;
            var sentIdChangedMessage = !(oldId === newId);

            socket.trackerID = newId;

            if(sentConnectedMessage) module.exports.emit("trackerConnected", socket);
            if(sentIdChangedMessage && !sentConnectedMessage) module.exports.emit("trackerIdChanged", socket, oldId);
        }
        else {
            console.log("Connected device sent no or an invalid id, aborting connection...");
            socket.end();
        }
    };

    socket._quitCommands = function (startIndex, count, errorText) {
        // Remove the desired commands from the quie
        var commands = socket.commandQueue.splice(startIndex, count);

        for (var i = 0; i < commands.length; i++) {
            commands[i].finishAndCallCallback(socket, errorText);
        }

        // send next command from the queue
        socket.sendCommand();
    };

    socket._processDataLine = function (line) {

        if (S(line).isEmpty()) return;

        if (socket.commandQueue.length > 0) {
            for (var i = 0; i < socket.commandQueue.length; i++) {
                switch (socket.commandQueue[0].parseLine(line)) {
                    case atFormat.ATCommandReturnCode.AWAIT_MORE_DATA:
                        return;

                    case atFormat.ATCommandReturnCode.SUCCESSFULLY_FINISHED:
                        socket._quitCommands(null, i, 1);
                        return;

                    case atFormat.ATCommandReturnCode.WRONG_COMMAND:
                        break;

                    case atFormat.ATCommandReturnCode.UNKNOWN_DATA: // Fall through default
                    default:
                        i = socket.commandQueue.length; // break the loop
                }
            }
        }

        // parse for async data
        var result;

        // async Data like GPS, etc.
        result = atFormat.parseASCII_TXT(line);
        if (result != null) {
            module.exports.emit('TxtDataReceived', socket, result);
            return;
        }

        result = atFormat.parseASCII_Garmin(line);
        if (result != null) {
            module.exports.emit('GarminDataReceived', socket, result);
            return;
        }

        result = atFormat.parseASCII_OBD(line);
        if (result != null) {
            module.exports.emit('OBDDataReceived', socket, result);
            return;
        }

        // GPS must be at the end, because GPS has no
        result = atFormat.parseASCII_GPS(line);
        if (result != null) {
            module.exports.emit('gpsDataReceived', socket, result);
            return;
        }

        debug('Unrecognised data: ' + line);
    };

    // Handle incoming messages from clients.
    socket.on('data', function(data) {

        socket.timeoutCount = 0;

        // check for ASCII Heartbeat Message
        if (data.readUInt16BE(0) == 0xfaf8) {
            // CareU1 Heartbeat
            try {

                var asciiAck = atFormat.atASCIIAcknowledge.parse(data);

                socket.deviceType = atFormat.DeviceTypes.CAREU1_TRACKER;
                socket.isASCIIFormat = true;

                socket._setTrackerID(asciiAck.modemID);

                // answer handshake
                socket.write(data);

                return;
            }
            catch (err) {
                debug(err, data);
            }
        }
        else if (data.readUInt16BE(0) == 0xfaf9) {
            // Netmodule Heartbeat
            try {
                var sequenceID = S(data.toString('ascii', 2, 4)).toInteger();
                var modemID = S(data.toString('ascii', 4)).toInteger();

                socket.deviceType = atFormat.DeviceTypes.NETMODULE;
                socket.isASCIIFormat = true;

                socket._setTrackerID(modemID);

                module.exports.emit('heartbeatReceived', socket, sequenceID);

                // answer handshake
                socket.write(data);

                return;
            }
            catch (err) {
                debug(err, data);
            }
        }

        // Check for Binary format
        try {
            var packet = atFormat.atBinaryResponsePacket.parse(data);

            debug("Received from tracker " + socket.trackerID, packet);

            // binary protocoll is only supported on CAREU1 Tracker
            socket.deviceType = atFormat.DeviceTypes.CAREU1_TRACKER;
            socket.isASCIIFormat = false;
            socket.lastTransactionID = packet.transactionID;
        }
        catch (err) {
            if (socket.isASCIIFormat = false) {
                console.log(err);
            }

            // Process ASCII Message
            socket.isASCIIFormat = true;
            debug("Received from tracker " + socket.trackerID, data.toString('ascii'));

            socket._processDataLine(data.toString('ascii'));
            return;
        }

        // Process Binary Message
        switch (packet.messageEncoding) {
            case 0x00: //atFormat.atAsyncStatusMessage,
                var modemIDOrIMEI = (new Long(packet.message.modemID2, packet.message.modemID1, true)).toString();

                if (packet.message.messageID == 0xAB) {
                    // heartbeat
                    socket._setTrackerID(modemIDOrIMEI);

                    module.exports.emit('heartbeatReceived', socket, packet.transactionID);
                }
                else {

                    // handle the annoying 24-bit signed integer for altitude
                    // convert to a 32 bit integer (signed / unsigned) and then divide last 8 bits away
                    var altitudeBuffer = new Buffer([packet.message.data.altitude1, packet.message.data.altitude2, packet.message.data.altitude3, 0x00]);
                    var altitude = altitudeBuffer.readInt32BE(0) / Math.pow(2, 8);

                    // GPS Position
                    var gpsObj = {
                        devicetime: atFormat.getMomentFromBinaryObject(packet.message.data.rtc).toDate(),
                        gpstime: atFormat.getMomentFromBinaryObject(packet.message.data.gps).toDate(),
                        latitude: packet.message.data.latitude / 100000,
                        longitude: packet.message.data.longitude / 100000,
                        altitude: altitude,
                        speed: packet.message.data.speed / 10,
                        direction: packet.message.data.direction / 10,
                        satelliteCount: packet.message.data.satelliteCount
                    };

                    module.exports.emit('gpsDataReceived', socket, gpsObj);
                }
                break;
            case 0x01: //atFormat.atCommandResponse,

                var lines = packet.message.messageData.toString().replace('\r\n', '\n').replace('\r', '\n').split("\n");

                for (var j = 0; j < lines.length; j++) {
                    socket._processDataLine(lines[j]);
                }
                break;

            case 0x02: //atFormat.atAsyncTextMessage, // Text

                module.exports.emit('TxtDataReceived', socket, {
                    textMessage: packet.message.textMessage,
                    deviceTime: atFormat.getMomentFromBinaryObject(packet.message.rtc).toDate(),
                    posSendingTime: atFormat.getMomentFromBinaryObject(packet.message.posSending).toDate()
                });
                return;

            case 0x03: //atFormat.atAsyncTextMessage, // Garmin

                module.exports.emit('GarminDataReceived', socket, {
                    textMessage: packet.message.textMessage,
                    deviceTime: atFormat.getMomentFromBinaryObject(packet.message.rtc).toDate(),
                    posSendingTime: atFormat.getMomentFromBinaryObject(packet.message.posSending).toDate()
                });
                return;

            case 0x04: //atFormat.atAsyncTextMessage  // OBD

                module.exports.emit('OBDDataReceived', socket, {
                    textMessage: packet.message.textMessage,
                    deviceTime: atFormat.getMomentFromBinaryObject(packet.message.rtc).toDate(),
                    posSendingTime: atFormat.getMomentFromBinaryObject(packet.message.posSending).toDate()
                });
                return;
        }

        // Acknowledge async messages
        if (packet.messageType == 0x02) {
            // answer async message with acknowledge
            socket.write(atFormat.generateBinaryAcknowledge(packet.transactionID, true));
        }
    });

    // Remove the client from the list when it leaves
    socket.on('close', function(had_error) {

        debug("Close socket for device with IP " + socket.remoteAddress + " (Device-ID: " + socket.trackerID + ")" );
        socket._quitCommands("Device disconnected", 0, socket.commandQueue.length - 1);

        module.exports.clients.splice(module.exports.clients.indexOf(socket), 1);

        if(socket.trackerID) {
            module.exports.emit("trackerDisconnected", socket, had_error);
        }
    });

    /*
     socket.on('close', function(had_error) {
     module.exports.clients.splice(module.exports.clients.indexOf(socket), 1);
     module.exports.emit("trackerDisconnected", socket, had_error);
     });
     *

    // Put this new client in the list
    module.exports.clients.push(socket);
    debug("Device with remote IP " + socket.remoteAddress + " connected!");
});


module.exports.onCommand = function(command, eventtype, callback) {
    var i;
    for(i = 0; i < atFormat.CommandList.length; i++) {
        if(atFormat.CommandList[i].isCommand(command)) {
            atFormat.CommandList[i].on(eventtype, callback);
            return atFormat.CommandList[i];
        }
    }
    return null;
};

module.exports.onCommand('MODID', 'onSuccess', function(tracker, commandObj) {
    if(!commandObj.isReadCommand() && !S(commandObj.newValue).isEmpty()) {
        tracker._setTrackerID(commandObj.newValue)
    }
});

// Start a TCP Server
module.exports = socket;

module.exports.clients = [];

module.exports.AtCommand = atFormat.AtCommand;
module.exports.DeviceTypes = atFormat.DeviceTypes;

module.exports.sendCommand = function (trackerID, command, newValue, callback) {

    var newCommand = new atFormat.AtCommand(command, newValue, callback);

    var trackerIDString = S(trackerID);

    if(trackerIDString.isEmpty()) {
        newCommand.finishAndCallCallback(null, 'Tracker id is empty!');
        return;
    }

    if(!trackerIDString.isNumeric()) {
        newCommand.finishAndCallCallback(null, 'Tracker id ' + trackerID + ' is not numeric!');
        return;
    }

    trackerID = trackerIDString.toString();

    for (var i = 0; i < module.exports.clients.length; i++) {
        var client = module.exports.clients[i];
        if (client.trackerID && client.trackerID === trackerID) {
            client.sendCommand(newCommand);
            return;
        }
    }

    newCommand.finishAndCallCallback(null, 'Tracker id ' + trackerID + ' not found!');
};
*/

exports = {};