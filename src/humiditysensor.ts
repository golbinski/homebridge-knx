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

export interface KNXHumiditySensorConfig {
  displayName: string,
  groupAddress: string,
}

export class KNXHumiditySensor extends KNXAccessoryPlugin {
  private currentRelativeHumidity = 40;
  private service: Service;

  constructor(
    private readonly config: KNXHumiditySensorConfig,
    platform: KNXPlatform,
    log: Logger) {
    super(config.displayName, config.groupAddress, 'DPT9.007', platform, log);
    this.service = new this.platform.Service.HumiditySensor(this.name);
    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .on('get', (callback) => { callback(null, this.currentRelativeHumidity); });
    this.on('update', (address, value) => {
      this.currentRelativeHumidity = value;
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.currentRelativeHumidity);
    });
    this.subscribe(this.address);
  }
  
  buildServices(): Service[] {
    return [
      this.service,
    ];
  }
}

