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

export interface KNXSwitchConfig {
  displayName: string,
  groupAddress: string
}

export class KNXSwitch extends KNXAccessoryPlugin {
  private switchOn = false;
  private service: Service;

  constructor(
    private readonly config: KNXSwitchConfig,
    platform: KNXPlatform,
    log: Logger) {
    super(config.displayName, config.groupAddress, 'DPT1.001', platform, log);
    this.service = new this.platform.Service.Switch(this.name);
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .on('set', this.setOn.bind(this))
      .on('get', this.getOn.bind(this));
    this.on('update', (address, value) => {
      this.switchOn = value > 0;
      this.service.updateCharacteristic(this.platform.Characteristic.On, this.switchOn);
    });
    this.subscribe(this.address);
  }

  setOn(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.write(value ? 1 : 0, callback);
  }

  getOn(callback: CharacteristicGetCallback) {
    callback(null, this.switchOn);
  }

  buildServices(): Service[] {
    return [
      this.service,
    ];
  }
}
