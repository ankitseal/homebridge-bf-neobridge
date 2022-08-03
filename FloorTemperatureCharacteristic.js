
var inherits = require('util').inherits

module.exports = function (homebridge) {
  	const Characteristic = homebridge.hap.Characteristic
  	const CustomCharacteristic = {}

  	CustomCharacteristic.FloorTemperatureCharacteristic = function () {
    	Characteristic.call(this, 'Floor Temperature', CustomCharacteristic.FloorTemperatureCharacteristic.UUID);
    		this.setProps({
    			format: Characteristic.Formats.FLOAT,
      			unit: Characteristic.Units.CELSIUS,
      			minValue: -100,
      			maxValue: 100,
      			minStep: 0.1,
      			perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
    		})
    	
    	this.value = this.getDefaultValue()
  	}

  	CustomCharacteristic.FloorTemperatureCharacteristic.UUID = 'E873F11A-079E-48FF-8F27-9C2605A29F52'
  	inherits(CustomCharacteristic.FloorTemperatureCharacteristic, Characteristic)

  	return {CustomCharacteristic}
}
