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

export interface KNXCarbonDioxideSensorConfig {
  displayName: string,
  groupAddress: string,
  warningThreshold: number,
}

export class KNXCarbonDioxideSensor extends KNXAccessoryPlugin {
  private carbonDioxideLevel = 401.33;
  private service: Service;

  constructor(
    private readonly config: KNXCarbonDioxideSensorConfig,
    platform: KNXPlatform,
    log: Logger) {
    super(config.displayName, config.groupAddress, 'DPT9.008', platform, log);
    this.service = new this.platform.Service.CarbonDioxideSensor(this.name);
    this.service.getCharacteristic(this.platform.Characteristic.CarbonDioxideDetected)
      .on('get', this.getCarbonDioxideDetected.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.CarbonDioxideLevel)
      .on('get', this.getCarbonDioxideLevel.bind(this));
    this.on('update', (address, value) => {
      this.carbonDioxideLevel = value;
      this.service.updateCharacteristic(this.platform.Characteristic.CarbonDioxideDetected, this.detectedFromLevel(this.carbonDioxideLevel));
      this.service.updateCharacteristic(this.platform.Characteristic.CarbonDioxideLevel, this.carbonDioxideLevel);
    });
    this.subscribe(this.address);
  }
  
  detectedFromLevel(value) {
    if (value < this.config.warningThreshold) {
      return this.platform.Characteristic.CarbonDioxideDetected.CO2_LEVELS_NORMAL;
    } else {
      return this.platform.Characteristic.CarbonDioxideDetected.CO2_LEVELS_ABNORMAL;
    }
  }

  getCarbonDioxideDetected(callback: CharacteristicGetCallback) {
    callback(null, this.detectedFromLevel(this.carbonDioxideLevel));
  }
  
  getCarbonDioxideLevel(callback: CharacteristicGetCallback) {
    callback(null, this.carbonDioxideLevel);
  }

  buildServices(): Service[] {
    return [
      this.service,
    ];
  }
}

