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

export interface KNXLightSensorConfig {
  displayName: string,
  groupAddress: string,
}

export class KNXLightSensor extends KNXAccessoryPlugin {
  private currentAmbientLightLevel = 0;
  private service: Service;

  constructor(
    private readonly config: KNXLightSensorConfig,
    platform: KNXPlatform,
    log: Logger) {
    super(config.displayName, config.groupAddress, 'DPT9.004', platform, log);
    this.service = new this.platform.Service.LightSensor(this.name);
    this.service.getCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel)
      .on('get', (callback) => { callback(null, this.currentAmbientLightLevel); });
    this.on('update', (address, value) => {
      this.currentAmbientLightLevel = value;
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, this.currentAmbientLightLevel);
    });
    this.subscribe(this.address);
  }
  
  buildServices(): Service[] {
    return [
      this.service,
    ];
  }
}

