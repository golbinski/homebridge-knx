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

export interface KNXAirQualitySensorConfig {
  displayName: string,
  vocDensityGroupAddress: string,
  vocDensityUnit: 'ppm' | 'ppb',
  vocAverageMolecularWeight: number,
}

export class KNXAirQualitySensor extends KNXAccessoryPlugin {
  private vocDensity = 0;
  private service: Service;

  constructor(
    private readonly config: KNXAirQualitySensorConfig,
    platform: KNXPlatform,
    log: Logger) {
    super(config.displayName, config.vocDensityGroupAddress, 'DPT9.008', platform, log);
    this.service = new this.platform.Service.AirQualitySensor(this.name);
    this.service.getCharacteristic(this.platform.Characteristic.AirQuality)
      .on('get', (callback) => { callback(null, this.determineAirQuality()); });
    this.service.getCharacteristic(this.platform.Characteristic.VOCDensity)
      .on('get', (callback) => { callback(null, this.vocDensityToHAP(this.vocDensity)); });
    this.on('update', (address, value) => {
      this.vocDensity = value;
      this.service.updateCharacteristic(this.platform.Characteristic.AirQuality, this.determineAirQuality());
      this.service.updateCharacteristic(this.platform.Characteristic.VOCDensity, this.vocDensityToHAP(this.vocDensity));
    });
    this.subscribe(this.address);
  }

  vocDensityToHAP(value) {
    // Apple HomeKit expects value of concentration of
    // the micrograms of chemicals per cubic meter
    // formula: ug/m3 = 0.0409 * ppb * molecular weight
    if (this.config.vocDensityUnit === 'ppm') {
      value = 1000 * value;
    }
    return 0.0409 * value * this.config.vocAverageMolecularWeight;
  }
  
  vocToPPB(value) {
    if (this.config.vocDensityUnit === 'ppm') {
      return 1000 * value;
    }
    return value;
  }

  determineAirQuality() {
    const voc = this.vocToPPB(this.vocDensity);
    if (voc < 100) {
      return this.platform.Characteristic.AirQuality.EXCELLENT;
    } else if (voc < 250) {
      return this.platform.Characteristic.AirQuality.GOOD;
    } else if (voc < 1000) {
      return this.platform.Characteristic.AirQuality.FAIR;
    } else if (voc < 2500) {
      return this.platform.Characteristic.AirQuality.INFERIOR;
    } else {
      return this.platform.Characteristic.AirQuality.POOR;
    }
  }
  
  buildServices(): Service[] {
    return [
      this.service,
    ];
  }
}

