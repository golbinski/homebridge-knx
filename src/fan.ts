import {
  AccessoryPlugin,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  Logger,
  Service,
} from "homebridge";
import { KNXPlatform } from './platform';
import { KNXAccessoryPlugin } from './accessory';

export interface KNXFanConfig {
  displayName: string,
  groupAddress: string
}

export class KNXFan extends KNXAccessoryPlugin {
  private active = false;
  private service: Service;

  constructor(
    private readonly config: KNXFanConfig,
    platform: KNXPlatform,
    log: Logger) {
    super(config.displayName, config.groupAddress, 'DPT1.001', platform, log);
    this.service = new this.platform.Service.Fanv2(this.name);
    this.service.getCharacteristic(this.platform.Characteristic.Active)
      .on('set', (value, callback) => { this.write(value ? 1 : 0, callback); })
      .on('get', (callback) => { callback(this.active); });
    this.on('update', (address, value) => {
      this.active = value > 0;
      this.service.updateCharacteristic(this.platform.Characteristic.Active, this.active);
    });
    this.subscribe(this.address);
  }

  buildServices(): Service[] {
    return [
      this.service,
    ];
  }
}
