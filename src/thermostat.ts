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

export interface KNXThermostatConfig {
  displayName: string,
  targetGroupAddress: string,
  statusGroupAddress: string,
  valveGroupAddress: string,
  minTemperature: number,
  maxTemperature: number,
}

export class KNXThermostat extends KNXAccessoryPlugin {
  private currentTemperature = 21;
  private targetTemperature = 21;
  private valveLevel = 0; 
  private service: Service;

  constructor(
    private readonly config: KNXThermostatConfig,
    platform: KNXPlatform,
    log: Logger) {
    super(config.displayName, config.targetGroupAddress, 'DPT9.001', platform, log);
    this.service = new this.platform.Service.Thermostat(this.name);
    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .on('get', this.getCurrentHeatingCoolingState.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .setProps({
        validValues: [this.platform.Characteristic.TargetHeatingCoolingState.AUTO]
      })
      .on('get', (callback) => { callback(null, this.platform.Characteristic.TargetHeatingCoolingState.AUTO); })
      .on('set', (value, callback) => {
        if (value !== this.platform.Characteristic.TargetHeatingCoolingState.AUTO) {
          callback(new Error('not supported'));
        } else {
          callback(null);
        }
      });
    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .on('get', this.getCurrentTemperature.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .setProps({
        minValue: this.config.minTemperature,
        maxValue: this.config.maxTemperature
      })
      .on('get', this.getTargetTemperature.bind(this))
      .on('set', this.setTargetTemperature.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .setProps({
        validValues: [this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS]
      })
      .on('get', (callback) => { callback(null, this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS); })
      .on('set', (value, callback) => {
        if (value !== this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS) {
          callback(new Error('not supported'));
        } else {
          callback(null);
        }
      });
    this.on('update', (address, value) => {
      if (address === this.config.targetGroupAddress) {
        this.targetTemperature = value;
        this.service.updateCharacteristic(this.platform.Characteristic.TargetTemperature, this.targetTemperature);
      } else if (address === this.config.statusGroupAddress) {
        this.currentTemperature = value;
        this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.currentTemperature);
      } else {
        this.valveLevel = value;
      }
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState, this.determineCurrentHeatingCoolingState());
    });
    this.subscribe(this.config.targetGroupAddress);
    this.subscribe(this.config.statusGroupAddress);
    if (this.hasConfiguredValve()) {
      this.subscribe(this.config.valveGroupAddress);
    }
  }
  
  hasConfiguredValve() {
    return this.config.valveGroupAddress.length > 0;
  }

  determineCurrentHeatingCoolingState() {
    if (this.hasConfiguredValve()) {
      if (this.valveLevel > 0) {
        // valve could be still open to keep current temperature on target level
        // therefore it might get a bit over that level
        if (this.targetTemperature >= (this.currentTemperature + 0.5)) {
          return this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
        } else {
          return this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
        }
      } else {
        return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
      }
    } else {
      if (this.targetTemperature > this.currentTemperature) {
        return this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
      } else if (this.targetTemperature < this.currentTemperature) {
        return this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
      } else {
        return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
      }
    }
  }

  getCurrentHeatingCoolingState(callback: CharacteristicGetCallback) {
    callback(null, this.determineCurrentHeatingCoolingState());
  }

  getCurrentTemperature(callback: CharacteristicGetCallback) {
    callback(null, this.currentTemperature);
  }

  getTargetTemperature(callback: CharacteristicGetCallback) {
    callback(null, this.targetTemperature);
  }

  setTargetTemperature(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.write(value, callback);
  }

  buildServices(): Service[] {
    return [
      this.service,
    ];
  }
}
