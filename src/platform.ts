import { API, StaticPlatformPlugin, Logger, AccessoryPlugin, PlatformConfig, Service, Characteristic } from 'homebridge';
import { Connection, Parser, str2addr, createMessage } from 'eibd';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { KNXAccessoryPlugin } from './accessory';
import { KNXSwitchConfig, KNXSwitch } from './switch';
import { KNXWindowCoveringConfig, KNXWindowCovering } from './windowcovering';
import { KNXCarbonDioxideSensorConfig, KNXCarbonDioxideSensor } from './carbondioxidesensor';
import { KNXTemperatureSensorConfig, KNXTemperatureSensor } from './temperaturesensor';
import { KNXThermostatConfig, KNXThermostat } from './thermostat';

export interface KNXGatewayConfig {
  ipAddress: string,
  port: number,
}

export interface KNXDebuggingConfig {
  logBusTraffic: boolean,
}

export interface KNXOptions {
  gateway: KNXGatewayConfig,
  switches: KNXSwitchConfig[],
  windowCoverings: KNXWindowCoveringConfig[],
  carbonDioxideSensors: KNXCarbonDioxideSensorConfig[],
  temperatureSensors: KNXTemperatureSensorConfig[],
  thermostats: KNXThermostatConfig[],
  debug: KNXDebuggingConfig,
}

interface Subscriber {
  address: string,
  accessory: KNXAccessoryPlugin,
}

interface PendingRequest {
  request: 'read' | 'write',
  groupAddress: string,
  callback,
  dpt?: string,
  value?: string,
}

export class KNXPlatform implements StaticPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public readonly config: KNXOptions;

  private connection: typeof Connection | null = null;
  private busmonitor: typeof Parser | null = null;
  private devices: KNXAccessoryPlugin[] = [];
  private subscribers: Subscriber[] = [];
  private pendingRequests: PendingRequest[] = []; 

  constructor(
    public readonly log: Logger,
    config: PlatformConfig,
    public readonly api: API,
  ) {
    this.config = {
      gateway: config.gateway as KNXGatewayConfig,
      switches: config.switches as KNXSwitchConfig[],
      windowCoverings: config.windowCoverings as KNXWindowCoveringConfig[],
      carbonDioxideSensors: config.carbonDioxideSensors as KNXCarbonDioxideSensorConfig[],
      temperatureSensors: config.temperatureSensors as KNXTemperatureSensorConfig[],
      thermostats: config.thermostats as KNXThermostatConfig[],
      debug: config.debugging as KNXDebuggingConfig,
    };
    this.connect(); 
  }

  private open(callback) {
    const connection = new Connection();
    connection.socketRemote({
      host: this.config.gateway.ipAddress,
      port: this.config.gateway.port
    }, (err) => { callback(err, connection); });
    return connection;
  }

  private connect() {
    this.log.info('Connecting to knxd at', this.config.gateway.ipAddress + ':' + this.config.gateway.port.toString());
    this.connection = this.open((err) => {
      if (err) {
        this.log.error(err.message);
        return;
      }
      this.log.info('Attaching to KNX bus');
      this.connection!.openGroupSocket(0, (parser) => {
        this.log.info('Attached to KNX bus, starting event listeners...');
        this.busmonitor = parser;
        if (this.config.debug.logBusTraffic) {
          this.busmonitor.on('write', (src, dest, dpt, val) => {
            this.log.debug('Write from', src, 'to', dest + ':', val, '[' + dpt + ']');
          });
          this.busmonitor.on('response', (src, dest, dpt, val) => {
            this.log.debug('Response from', src, 'to', dest + ':', val, '[' + dpt + ']');
          });
        }
        for (const subscriber of this.subscribers) {
          this.busSubscribe(subscriber);
        }
      });
    });
    this.connection.on('close', () => {
      this.log.warn('eibd connection closed, reconnecting...');
      setTimeout(() => { this.connect(); }, 100);
    });
  }

  accessories(callback: (foundAccessories: AccessoryPlugin[]) => void): void {
    this.buildDevicesFromConfig(this.config.switches, KNXSwitch);
    this.buildDevicesFromConfig(this.config.windowCoverings, KNXWindowCovering);
    this.buildDevicesFromConfig(this.config.carbonDioxideSensors, KNXCarbonDioxideSensor);
    this.buildDevicesFromConfig(this.config.temperatureSensors, KNXTemperatureSensor);
    this.buildDevicesFromConfig(this.config.thermostats, KNXThermostat);
    callback(this.devices);
  }

  buildDevicesFromConfig<Accessory extends KNXAccessoryPlugin>(config, factory: { new(...args): Accessory ;}) {
    for (const device of config) {
      const accessory = new factory(device, this, this.log);
      this.devices.push(accessory);
    }
  }

  subscribe(address: string, accessory: KNXAccessoryPlugin) {
    const subscriber = {
      address: address,
      accessory: accessory
    };
    this.subscribers.push(subscriber);
    if (this.busmonitor != null) {
      this.busSubscribe(subscriber);
    }
  }
  
  private busSubscribe(subscriber: Subscriber) {
    this.log.info('Subscribing', subscriber.accessory.name, '(' + subscriber.address + ')', 'to KNX bus');
    this.busmonitor!.on(subscriber.address, (event, src, dest, dpt, value) => {
      if (event === 'write' || event === 'response') {
        this.log.debug(subscriber.accessory.name, 'received', '<' + event + '>', 'from', src, 'to', dest, ':=', value, '[' + dpt + ']');
      }
      if (event === 'write') {
        subscriber.accessory.emit('update', dest, value);
      }
    });
    this.read(subscriber.address, (err, value) => {
      subscriber.accessory.emit('update', subscriber.address, value);
    });
  }

  private send(groupAddress: string, msg, callback) {
    this.open((err, connection) => {
      if (err) {
        callback(new Error(err.message + ' (while opening connection)')); 
        return;
      }
      const addr = str2addr(groupAddress);
      connection.openTGroup(addr, 0, (err) => {
        if (err) {
          callback(new Error(err.message + ' (while opening T_Group)')); 
          return;
        }
        connection.sendAPDU(msg, (err) => {
          if (err) {
            callback(new Error(err.message + ' (while sending APDU)')); 
          } else {
            callback(null);
          }
        }); 
      });
    });
  }

  private execute(request: PendingRequest) {
    if (request.request === 'read') {
      this.log.debug('Sending', '<' + request.request + '>', 'to', request.groupAddress);
    } else {
      this.log.debug('Sending', '<' + request.request + '>', 'to', request.groupAddress, ':=', request.value, '[' + request.dpt + ']');
    }
    const msg = request.request === 'read' ? createMessage('read') : createMessage('write', request.dpt, request.value);
    this.send(request.groupAddress, msg, (err) => {
      if (err) {
        this.log.error('Cannot send', '<' + request.request + '>', 'to', request.groupAddress + ':', err.message);
      } else if (request.request === 'read') {
        this.log.debug('Sent', '<' + request.request + '>', 'to', request.groupAddress);
      } else {
        this.log.debug('Sent', '<' + request.request + '>', 'to', request.groupAddress, ':=', request.value, '[' + request.dpt + ']');
      }
      request.callback(err);
      if (request !== this.pendingRequests.shift()) {
        this.log.warn('Corrupted pending requests queue detected');
      }
      if (this.pendingRequests.length > 0) {
        this.execute(this.pendingRequests[0]);
      }
    });
  }

  private schedule(request: PendingRequest) {
    this.pendingRequests.push(request);
    if (this.pendingRequests.length === 1) {
      this.execute(this.pendingRequests[0]);
    }
  }
 
  read(groupAddress: string, callback) {
    const handler = (src, dest, dpt, val) => {
      if (dest === groupAddress) {
        this.busmonitor!.off('response', handler);
        callback(null, val);
      }
    };
    this.schedule({
      request: 'read',
      groupAddress: groupAddress,
      callback: (err) => {
        if (err) {
          callback(err);
          return;
        }
        this.busmonitor!.on('response', handler);
      }
    });
  }
 
  write(groupAddress: string, dpt: string, value, callback) {
    this.schedule({
      request: 'write',
      groupAddress: groupAddress,
      callback: callback,
      dpt: dpt,
      value: value
    });
  }
}
