import { EventEmitter } from 'events';
import { AccessoryPlugin, Logger, Service } from 'homebridge';
import { KNXPlatform } from './platform';

export class KNXAccessoryPlugin extends EventEmitter implements AccessoryPlugin {
  public readonly name: string;
  public readonly uuid_base: string;

  constructor(
    displayName: string,
    public readonly address: string,
    public readonly dpt: string,
    protected readonly platform: KNXPlatform,
    protected readonly log: Logger,
  ) {
    super();
    this.name = displayName;
    this.uuid_base = address;
  }

  subscribe(address) {
    this.platform.subscribe(address, this);
  }

  write(value, callback, address?, dpt?) {
    this.platform.write(address ? address : this.address, dpt ? dpt : this.dpt, value, callback);
  }

  getServices(): Service[] {
    const informationService = new this.platform.Service.AccessoryInformation()
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'KNX')
      .setCharacteristic(this.platform.Characteristic.Model, this.dpt)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.address);
    return [informationService].concat(this.buildServices());
  }

  buildServices(): Service[] {
    return [];
  }
}
