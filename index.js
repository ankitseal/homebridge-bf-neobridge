var heatmiser = require("heatmiser")
var Accessory, Service, Characteristic, UUIDGen, HAPServer

// var CustomCharacteristic

const getOrAddCharacteristic = (service, characteristic) => {
  return service.getCharacteristic(characteristic) || service.addCharacteristic(characteristic)
}

//
// Adding plug power state command
//
heatmiser.Neo.prototype.setPowerState = function(isOn, deviceNames, callback) {
	var data = {}
    data[isOn ? "TIMER_ON" : "TIMER_OFF"] = deviceNames
	this.command(data, callback)
}

//
// Exports the right things for homebridge
//
module.exports = function(homebridge) {
  console.log("homebridge API version: " + homebridge.version) 

  // Accessory must be created from PlatformAccessory Constructor
  Accessory = homebridge.platformAccessory

  // Service and Characteristic are from hap-nodejs
  Service = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic
  UUIDGen = homebridge.hap.uuid
  HAPServer = homebridge.hap.HAPServer

  // For platform plugin to be considered as dynamic platform plugin,
  // registerPlatform(pluginName, platformName, constructor, dynamic), dynamic must be true
  homebridge.registerPlatform("homebridge-bf", "Neobridge", NeobridgePlatform, true)
}

//
// Our main class encapsulating Neobridge functionality
//
class NeobridgePlatform {
	constructor(log, config, api) {
		log("Neobridge Platform Init")

		// init floortemperature custom characteristic
		// CustomCharacteristic = require('./FloorTemperatureCharacteristic')(api).CustomCharacteristic 
		
		this.log = log 
		this.config = config 
		this.accessories = new Map()
		this.devices = new Map()
		
		if (api) {
			// Save the API object as plugin needs to register new accessory via this object
			this.api = api 

			// Neobridge stuff
			this.neo = new heatmiser.Neo(config.neobridgeIP) // if the IP is missing in the config it'll try to autodetect it		
			this.neo.on('ready', () => {
				this.log("Neo connection ready") 
				this.neo.on('success', function (data) {
					console.log(data) 
				}) 
				this.neo.on('error', function (data) {
					console.log(data) 
				}) 
				// initially retrieve temps
				this.retrieveAccessories() 
				// check for new values periodically
				setInterval(this.retrieveAccessories.bind(this), 10 * 1000) 
			})
			// Listen to event "didFinishLaunching", this means homebridge already finished loading cached accessories.
			// Platform Plugin should only register new accessory that doesn't exist in homebridge after this event.
			// Or start discover new accessories.
			this.api.on('didFinishLaunching', () => {
				// this.log("DidFinishLaunching") 
				// this.removeAllAccessories()
			}) 
		}
	}
	
	retrieveAccessories() {
		this.neo.info(data => {
			// console.log("***** " + data.devices.length + " devices found") 	
			this.devices.clear()
			
			// • Now cycle through each of the devices
			data.devices.forEach(device => {
				// console.log(device.device + " - " + device.CURRENT_TEMPERATURE + ", " + device.CURRENT_FLOOR_TEMPERATURE) 
				// console.log(device)
				// storing the device info for later
				this.devices.set(device.device, device)
				// only if it's not yet registered
				var accessory = this.accessories.get(device.device)
				if (accessory) {
					// this.log("* Already registered - " + accessory.displayName + " - " + device.DEVICE_TYPE) 
				} 
				else {
					this.log("* Registering new accessory - " + device.DEVICE_TYPE) 
					accessory = this.addAccessory(device) 
				}
				// updates values
				this.updateCharacteristicsValues(accessory)
			}) 

			// • Now we check if there are orphan accessories - not present in the list of devices received from the bridge
			const a = [...this.accessories.keys()]
			const d = [...this.devices.keys()]

			let orphanNames = a.filter(x => !d.includes(x))
			if (orphanNames.length > 0) {
				this.log("Removing - " + orphanNames)
				const orphans = orphanNames.map(o => this.accessories.get(o))
				this.removeAccesories(orphans)
			}
		}) 
	}

	updateCharacteristicsValues(accessory) {
		if (accessory == null) { return }

		const device = this.devices.get(accessory.displayName)
		const isOffline = device.OFFLINE
		// const err = new Error(HAPServer.Status.SERVICE_COMMUNICATION_FAILURE)

		// updates based on the type of accesory - plug or thermostat
		switch(accessory.context.type) {
			case "thermostat" :		
				accessory
					.getService(Service.Thermostat)
					
					.updateCharacteristic(Characteristic.CurrentTemperature, ((device.CURRENT_TEMPERATURE-32)*5)/9)
					// .updateCharacteristic(CustomCharacteristic.FloorTemperatureCharacteristic, isOffline ? err : ((device.CURRENT_FLOOR_TEMPERATURE-32)*5)/9) 
					.updateCharacteristic(Characteristic.TargetTemperature, ((device.CURRENT_SET_TEMPERATURE-32)*5)/9)
					.updateCharacteristic(Characteristic.TargetHeatingCoolingState,  device.STANDBY ? 0 : 1)
					.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, device.HEATING ? 1 : 0)

					// .updateCharacteristic(Characteristic.CurrentTemperature, isOffline ? err : ((device.CURRENT_TEMPERATURE-32)*5)/9)
					// .updateCharacteristic(CustomCharacteristic.FloorTemperatureCharacteristic, isOffline ? err : ((device.CURRENT_FLOOR_TEMPERATURE-32)*5)/9) 
					// .updateCharacteristic(Characteristic.TargetTemperature, isOffline ? err : ((device.CURRENT_SET_TEMPERATURE-32)*5)/9)
					// .updateCharacteristic(Characteristic.TargetHeatingCoolingState, isOffline ? err : device.STANDBY ? 0 : 1)
					// .updateCharacteristic(Characteristic.CurrentHeatingCoolingState, isOffline ? err : device.HEATING ? 1 : 0)
				break
			case "plug" :
				const isOn = device.TIMER && device.TIME_CLOCK_OVERIDE_BIT
				accessory
					.getService(Service.Outlet)
					.updateCharacteristic(Characteristic.On, isOn ? 1 : 0)
					// .updateCharacteristic(Characteristic.On, isOffline ? err : isOn ? 1 : 0)

					.updateCharacteristic(Characteristic.OutletInUse, isOn ? 1 : 0)
				break
		}
	}
	
	// Function invoked when homebridge tries to restore cached accessory.
	// Developer can configure accessory at here (like setup event handler).
	// Update current value.
	configureAccessory(accessory) {
		this.log(accessory.displayName, "- configure Accessory") 
		// Set the accessory to reachable if plugin can currently process the accessory,
		// otherwise set to false and update the reachability later by invoking
		// accessory.updateReachability()
		accessory.reachable = true 

		this.accessories.set(accessory.displayName, accessory) 
		this.registerAccessoryEvents(accessory)
	}
		
	// Sample function to show how developer can add accessory dynamically from outside event
	addAccessory(device) {
		this.log("Add Accessory - " + device.device) 

		const accessoryName = device.device
		const uuid = UUIDGen.generate(accessoryName) 
		var newAccessory = new Accessory(accessoryName, uuid) 

		// Plugin can save context on accessory to help restore accessory in configureAccessory()
		newAccessory.context.type = device.DEVICE_TYPE == 12 ? "thermostat" : "plug"
		
		// Make sure you provided a name for service, otherwise it may not visible in some HomeKit apps
		switch (device.DEVICE_TYPE) {
			case 12 : // thermostat
				newAccessory.addService(Service.Thermostat, accessoryName) 
				break
			case 6: // plug
				newAccessory.addService(Service.Outlet, accessoryName) 
				break
			default: // something else - don;t care `bout it
				return null
		}
		// now register characteristics' events
		this.registerAccessoryEvents(newAccessory)

		// put it on our list & register with the platform
		this.accessories.set(accessoryName, newAccessory) 
		this.api.registerPlatformAccessories("homebridge-bf", "Neobridge", [newAccessory]) 
		
		return newAccessory 
	}
	
	registerAccessoryEvents(accessory) {
		// Thermostat specific events
		switch (accessory.context.type) {

			case "thermostat" :
				const thermostatService = accessory.getService(Service.Thermostat)		

				thermostatService.getCharacteristic(Characteristic.TargetTemperature)
					.setProps({
						minValue: 5,
						maxValue: 35,
						minStep: 0.5
					})
					.on('set', (value, callback) => {
						this.setTargetTemperature(callback, accessory, value);
					})

				thermostatService.getCharacteristic(Characteristic.TargetHeatingCoolingState)
					.setProps({
						maxValue: Characteristic.TargetHeatingCoolingState.HEAT
					})
					.on('set', (value, callback) => {
						this.setTargetMode(callback, accessory, value)
					})

				// getOrAddCharacteristic(thermostatService, CustomCharacteristic.FloorTemperatureCharacteristic)
				break

			case "plug" :
				accessory.getService(Service.Outlet)
					.getCharacteristic(Characteristic.On)
					.on('set', (value, callback) => {
						this.setPlugPower(callback, accessory, value)
					})
				break
		}
	}

	removeAllAccessories() {
		this.log("Remove All Accessories") 
		this.api.unregisterPlatformAccessories("homebridge-bf", "Neobridge", [...this.accessories.values()]) 
		this.accessories.clear()
	}

	removeAccesories(accessories) {
		this.log("Remove accessories - " + accessories.length)
		this.api.unregisterPlatformAccessories("homebridge-bf", "Neobridge", accessories)

		accessories.forEach(a => this.accessories.delete(a.displayName))
	}

	setTargetTemperature(callback, accessory, value) {
		this.log(accessory.displayName + " (temp) -> " + value)
		// first turn on the device, otherwise we cannot set the temp as high as we want
		// this.neo.setStandby(false, [accessory.displayName], result => {
		// 	this.log(result.result)
			// now go and set the temp
			this.neo.setTemperature((((value*9)/5)+32), [accessory.displayName], result => {
				this.log(result.result)
				setTimeout(this.retrieveAccessories.bind(this), 1000) 
				callback()
			})
		// })
	}

	setTargetMode(callback, accessory, value) {
		this.log(accessory.displayName + " (away) -> " + !value)

		this.neo.setStandby(!value, [accessory.displayName], data => {
			this.log(data.result)
			setTimeout(this.retrieveAccessories.bind(this), 1000) 
			callback()
		})
	}

	setPlugPower(callback, accessory, value) {
		this.log(accessory.displayName + " (power) -> " + (value ? "on" : "off"))
		this.neo.setPowerState(value, [accessory.displayName], data => {
			this.log(data.result)
			callback()
		})
	}
}
