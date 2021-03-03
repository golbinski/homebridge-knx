import { API, StaticPlatformPlugin, Logger, AccessoryPlugin, PlatformConfig, Service, Characteristic } from 'homebridge';
import { Connection, Parser, str2addr, createMessage } from 'eibd';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { KNXAccessoryPlugin } from './accessory';
import { KNXSwitchConfig, KNXSwitch } from './switch';
import { KNXWindowCoveringConfig, KNXWindowCovering } from './windowcovering';
import { KNXCarbonDioxideSensorConfig, KNXCarbonDioxideSensor } from './carbondioxidesensor';

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
  debug: KNXDebuggingConfig,
}

interface Subscriber {
  address: string,
  accessory: KNXAccessoryPlugin,
}

export class KNXPlatform implements StaticPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public readonly config: KNXOptions;

  private connection: typeof Connection | null = null;
  private busmonitor: typeof Parser | null = null;
  private devices: KNXAccessoryPlugin[] = [];
  private subscribers: Subscriber[] = []; 

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

  private send(request: 'read' | 'write', groupAddress: string, callback, dpt?: string, value?: string) {
    this.open((err, connection) => {
      if (err) {
        this.log.error(err.message);
        callback(err); 
        return;
      }
      const addr = str2addr(groupAddress);
      connection.openTGroup(addr, 0, (err) => {
        if (err) {
          this.log.error(err.message);
          callback(err);
          return;
        }
        const msg = request === 'read' ? createMessage('read') : createMessage('write', dpt, value);
        connection.sendAPDU(msg, (err) => {
          if (err) {
            this.log.error(err.message);
            callback(err);
          } else {
            callback(null);
          }
        }); 
      });
    });
  }
 
  read(groupAddress: string, callback) {
    this.log.debug('Reading from', groupAddress);
    const handler = (src, dest, dpt, val) => {
      if (dest === groupAddress) {
        this.busmonitor!.off('response', handler);
        callback(null, val);
      }
    };
    this.send('read', groupAddress, (err) => {
      if (err) {
        callback(err);
        return;
      }
      this.busmonitor!.on('response', handler);
    });
  }
 
  write(groupAddress: string, dpt: string, value, callback) {
    this.log.debug('Writing to', groupAddress, ':=', value, '[' + dpt + ']');
    this.send('write', groupAddress, callback, dpt, value);
  }
}
