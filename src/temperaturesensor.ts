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

export interface KNXTemperatureSensorConfig {
  displayName: string,
  groupAddress: string,
  minTemperature: number,
  maxTemperature: number,
}

export class KNXTemperatureSensor extends KNXAccessoryPlugin {
  private currentTemperature = 21;
  private service: Service;

  constructor(
    private readonly config: KNXTemperatureSensorConfig,
    platform: KNXPlatform,
    log: Logger) {
    super(config.displayName, config.groupAddress, 'DPT9.001', platform, log);
    this.service = new this.platform.Service.TemperatureSensor(this.name);
    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .setProps({
        minValue: this.config.minTemperature,
        maxValue: this.config.maxTemperature
      })
      .on('get', (callback) => { callback(null, this.currentTemperature); });
    this.on('update', (address, value) => {
      this.currentTemperature = value;
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.currentTemperature);
    });
    this.subscribe(this.address);
  }
  
  buildServices(): Service[] {
    return [
      this.service,
    ];
  }
}

