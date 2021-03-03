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

export interface KNXWindowCoveringConfig {
  displayName: string,
  targetGroupAddress: string,
  statusGroupAddress: string,
  holdGroupAddress: string,
}

export class KNXWindowCovering extends KNXAccessoryPlugin {
  private currentPosition = 0;
  private targetPosition = 0;
  private positionState = this.platform.Characteristic.PositionState.STOPPED;
  private service: Service;

  constructor(
    private readonly config: KNXWindowCoveringConfig,
    platform: KNXPlatform,
    log: Logger) {
    super(config.displayName, config.targetGroupAddress, 'DPT5.001', platform, log);
    this.service = new this.platform.Service.WindowCovering(config.displayName);
    this.service.getCharacteristic(this.platform.Characteristic.CurrentPosition)
      .on('get', this.getCurrentPosition.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.TargetPosition)
      .on('get', this.getTargetPosition.bind(this))
      .on('set', this.setTargetPosition.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.PositionState)
      .on('get', this.getPositionState.bind(this));
    if (this.config.holdGroupAddress.length > 0) {
      this.service.getCharacteristic(this.platform.Characteristic.HoldPosition)
        .on('set', this.setHoldPosition.bind(this));
    }
    this.on('update', (address, value) => {
      this.updateCurrentPosition(value);
      this.logState('CURRENT_POSITION_UPDATE');
    });
    this.subscribe(this.config.statusGroupAddress);
  }

  positionStateToString(value) {
    if (value === this.platform.Characteristic.PositionState.INCREASING) {
      return 'INCREASING';
    } else if (value === this.platform.Characteristic.PositionState.DECREASING) {
      return 'DECREASING';
    } else {
      return 'STOPPED';
    }
  }
 
  logState(reason?) {
    if (reason) {
      this.log.debug('WindowCovering', '(' + this.address + ')', ':= {',
        'CurrentPosition=' + this.currentPosition.toString(),
        'TargetPosition=' + this.targetPosition.toString(),
        'PositionState=' + this.positionStateToString(this.positionState),
        '} triggered by', reason);
    } else {
      this.log.debug('WindowCovering', '(' + this.address + ')', ':= {',
        'CurrentPosition=' + this.currentPosition.toString(),
        'TargetPosition=' + this.targetPosition.toString(),
        'PositionState=' + this.positionStateToString(this.positionState),
        '}');
    }
  }
 
  refreshPositionState() {
    if (this.targetPosition < this.currentPosition) {
      this.positionState = this.platform.Characteristic.PositionState.INCREASING;
    } else if (this.targetPosition > this.currentPosition) {
      this.positionState = this.platform.Characteristic.PositionState.DECREASING;
    } else {
      this.positionState = this.platform.Characteristic.PositionState.STOPPED;
    }
    this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.positionState);
  }

  updateTargetPosition(value: number) {
    this.targetPosition = value;
    this.refreshPositionState();
  }

  updateCurrentPosition(value: number) {
    this.currentPosition = value;
    if (this.positionState === this.platform.Characteristic.PositionState.STOPPED) {
      // position change triggered externaly
      this.targetPosition = value;
    }
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, 100 - this.currentPosition);
    this.refreshPositionState();
  }

  changeTargetPosition(previous: number, target: number, callback) {
    this.updateTargetPosition(target);
    this.write(target, (err) => {
      if (err) {
        this.updateTargetPosition(previous);
        callback(err); 
        return;
      }
      this.logState('TARGET_POSITION_CHANGE');
      callback(null);
    });
  }
  

  setTargetPosition(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    const target : number = 100 - (value as number);
    if (target === this.targetPosition) {
      callback(null);
      return;
    }
    const previous = this.targetPosition;
    // on change during movement
    if (this.positionState !== this.platform.Characteristic.PositionState.STOPPED) {
      if (this.config.holdGroupAddress.length > 0) {
        this.write(1, (err) => {
          this.platform.read(this.config.statusGroupAddress, (err, value) => {
            this.currentPosition = value;
            this.changeTargetPosition(value, target, callback);
          });
        }, this.config.holdGroupAddress, 'DPT1.001');
      } else {
        // change target position during movement, assumes window covering reach the previous target position
        // just a heuristic which gonna be wrong sometimes
        this.currentPosition = previous;
        this.changeTargetPosition(previous, target, callback);
      }
    } else {
      this.changeTargetPosition(previous, target, callback);
    }
  }

  setHoldPosition(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.write(value ? 1 : 0, callback, this.config.holdGroupAddress, 'DPT1.001');
  }

  getCurrentPosition(callback: CharacteristicGetCallback) {
    callback(null, 100 - this.currentPosition);
  }

  getTargetPosition(callback: CharacteristicGetCallback) {
    callback(null, 100 - this.targetPosition);
  }

  getPositionState(callback: CharacteristicGetCallback) {
    callback(null, this.positionState);
  }

  buildServices(): Service[] {
    return [
      this.service,
    ];
  }
}

