const getAllEventData = require('getAllEventData');
const JSON = require('JSON');
const sendHttpRequest = require('sendHttpRequest');
const getTimestampMillis = require('getTimestampMillis');
const getContainerVersion = require('getContainerVersion');
const logToConsole = require('logToConsole');
const sha256Sync = require('sha256Sync');
const makeString = require('makeString');
const getRequestHeader = require('getRequestHeader');
const getType = require('getType');
const Math = require('Math');
const makeNumber = require('makeNumber');

const containerVersion = getContainerVersion();
const isDebug = containerVersion.debugMode;
const isLoggingEnabled = determinateIsLoggingEnabled();
const traceId = getRequestHeader('trace-id');

const eventData = getAllEventData();
const url = eventData.page_location || getRequestHeader('referer');

if (!isConsentGivenOrNotRequired()) {
  return data.gtmOnSuccess();
}

if (url && url.lastIndexOf('https://gtm-msr.appspot.com/', 0) === 0) {
  return data.gtmOnSuccess();
}

sendTrackRequest(mapEvent(eventData, data));

function sendTrackRequest(mappedEvent) {
  const postBody = mappedEvent;
  const postUrl = getPostUrl();

  if (isLoggingEnabled) {
    logToConsole(
      JSON.stringify({
        Name: 'Yelp',
        Type: 'Request',
        TraceId: traceId,
        EventName: mappedEvent.event_name,
        RequestMethod: 'POST',
        RequestUrl: postUrl,
        RequestBody: postBody
      })
    );
  }

  sendHttpRequest(
    postUrl,
    (statusCode, headers, body) => {
      if (isLoggingEnabled) {
        logToConsole(
          JSON.stringify({
            Name: 'Yelp',
            Type: 'Response',
            TraceId: traceId,
            EventName: mappedEvent.event_name,
            ResponseStatusCode: statusCode,
            ResponseHeaders: headers,
            ResponseBody: body
          })
        );
      }
      if (!data.useOptimisticScenario) {
        if (statusCode >= 200 && statusCode < 400) {
          data.gtmOnSuccess();
        } else {
          data.gtmOnFailure();
        }
      }
    },
    {
      headers: {
        'Authorization': 'Bearer '+ data.accessToken,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      method: 'POST'
    },
    JSON.stringify(postBody)
  );
}

if (data.useOptimisticScenario) {
  data.gtmOnSuccess();
}

function getPostUrl() {
  return 'https://api.yelp.com/v3/conversion/event';
}

function getEventName(eventData, data) {
  if (data.eventType === 'inherit') {
    let eventName = eventData.event_name;

    let gaToEventName = {
      page_view: 'page_view',
      'gtm.dom': 'page_view',
      add_to_cart: 'add_to_cart',
      sign_up: 'signup',
      purchase: 'purchase',
      view_item: 'view_content',
      add_to_wishlist: 'add_to_wishlist',
      begin_checkout: 'checkout',
      add_payment_info: 'add_payment_info',
      view_item_list: 'view_content',
      search: 'search',
      generate_lead: 'signup',

      contact: 'lead',
      find_location: 'search',

      'gtm4wp.addProductToCartEEC': 'add_to_cart',
      'gtm4wp.productClickEEC': 'view_content',
      'gtm4wp.checkoutOptionEEC': 'START_CHECKOUT',
      'gtm4wp.checkoutStepEEC': 'checkout',
      'gtm4wp.orderCompletedEEC': 'purchase'
    };

    if (!gaToEventName[eventName]) {
      return eventName;
    }

    return gaToEventName[eventName];
  }

  return data.eventType === 'standard' ? data.eventNameStandard : data.eventNameCustom;
}

function mapEvent(eventData, data) {
  let mappedData = {
    user_data: {},
    custom_data: {}
  };

  mappedData = addServerData(eventData, mappedData);
  mappedData = addUserData(eventData, mappedData);
  mappedData = addCustomData(eventData, mappedData);
  mappedData = hashDataIfNeeded(mappedData);

  return mappedData;
}

function addCustomData(eventData, mappedData) {
  let currencyFromItems = '';
  let valueFromItems = 0;

  if (eventData.items && eventData.items[0]) {
    mappedData.custom_data.contents = [];
    currencyFromItems = eventData.items[0].currency;

    if (!eventData.items[1]) {
      if (eventData.items[0].id) mappedData.custom_data.content_ids = [eventData.items[0].item_id];

      if (eventData.items[0].price) {
        mappedData.custom_data.value = eventData.items[0].quantity
          ? eventData.items[0].quantity * eventData.items[0].price
          : eventData.items[0].price;
      }
    }

    const itemIdKey = data.itemIdKey ? data.itemIdKey : 'item_id';
    eventData.items.forEach((d, i) => {
      let content = {};
      if (d[itemIdKey]) content.id = d[itemIdKey];
      if (d.quantity) content.quantity = d.quantity;

      if (d.price) {
        content.item_price = makeNumber(d.price);
        valueFromItems += d.quantity ? d.quantity * content.item_price : content.item_price;
      }

      mappedData.custom_data.contents.push(content);
    });
  }

  if (eventData['x-ga-mp1-ev']) mappedData.custom_data.value = eventData['x-ga-mp1-ev'];
  else if (eventData['x-ga-mp1-tr']) mappedData.custom_data.value = eventData['x-ga-mp1-tr'];
  else if (eventData.value) mappedData.custom_data.value = eventData.value;

  if (eventData.currency) mappedData.custom_data.currency = eventData.currency;
  else if (currencyFromItems) mappedData.custom_data.currency = currencyFromItems;

  if (eventData.content_category) mappedData.custom_data.content_category = eventData.content_category;
  if (eventData.search_term) mappedData.custom_data.search_string = eventData.search_term;
  if (eventData.transaction_id) mappedData.custom_data.order_id = eventData.transaction_id;

  if (mappedData.event_name === 'purchase') {
    if (!mappedData.custom_data.currency) mappedData.custom_data.currency = 'USD';
    if (!mappedData.custom_data.value) mappedData.custom_data.value = valueFromItems ? valueFromItems : 0;
  }

  if (data.customDataList) {
    data.customDataList.forEach((d) => {
      if (isValidValue(d.value)) {
        mappedData.custom_data[d.name] = d.value;
      }
    });
  }

  return mappedData;
}

function addServerData(eventData, mappedData) {
  mappedData.event_name = getEventName(eventData, data);
  mappedData.event_time = Math.round(getTimestampMillis() / 1000);
  mappedData.action_source = data.eventConversionType;
  mappedData.test_event = data.validate;
  mappedData.integration = 'stape';

  const eventId = eventData.event_id || eventData.transaction_id;
  if (eventId) mappedData.event_id = eventId;

  if (data.serverDataList) {
    data.serverDataList.forEach((d) => {
      if (isValidValue(d.value)) {
        mappedData[d.name] = d.value;
      }
    });
  }

  return mappedData;
}

function isHashed(value) {
  if (!value) {
    return false;
  }

  return makeString(value).match('^[A-Fa-f0-9]{64}$') !== null;
}

function hashData(value) {
  if (!value) {
    return value;
  }

  const type = getType(value);

  if (type === 'undefined' || value === 'undefined') {
    return undefined;
  }

  if (type === 'object') {
    return value.map((val) => {
      return hashData(val);
    });
  }

  if (isHashed(value)) {
    return value;
  }

  return sha256Sync(makeString(value).trim().toLowerCase(), {
    outputEncoding: 'hex'
  });
}

function hashDataIfNeeded(mappedData) {
  const fieldsToHash = ['em', 'fn', 'ln', 'db', 'ge', 'ph', 'country', 'st', 'zp', 'ct', 'external_id'];
  const fieldsToArray = ['em', 'ph', 'country', 'st', 'zp', 'ct', 'external_id'];

  for (let key in mappedData.user_data) {
    if (fieldsToHash.indexOf(key) !== -1) {
      if (fieldsToArray.indexOf(key) !== -1 && (getType(mappedData.user_data[key]) !== 'object' || getType(mappedData.user_data[key]) !== 'array')) {
        mappedData.user_data[key] = [mappedData.user_data[key]];
      }

      mappedData.user_data[key] = hashData(mappedData.user_data[key]);
    }
  }
  return mappedData;
}

function addUserData(eventData, mappedData) {
  let user_data = eventData.user_data || {};
  let address = user_data.address || {};

  if (eventData.email) mappedData.user_data.em = eventData.email;
  else if (user_data.email_address) mappedData.user_data.em = user_data.email_address;
  else if (user_data.email) mappedData.user_data.em = user_data.email;

  if (eventData.lastName) mappedData.user_data.ln = eventData.lastName;
  else if (eventData.LastName) mappedData.user_data.ln = eventData.LastName;
  else if (eventData.nameLast) mappedData.user_data.ln = eventData.nameLast;
  else if (eventData.last_name) mappedData.user_data.ln = eventData.last_name;
  else if (user_data.last_name) mappedData.user_data.ln = user_data.last_name;
  else if (address.last_name) mappedData.user_data.ln = address.last_name;

  if (eventData.firstName) mappedData.user_data.fn = eventData.firstName;
  else if (eventData.FirstName) mappedData.user_data.fn = eventData.FirstName;
  else if (eventData.nameFirst) mappedData.user_data.fn = eventData.nameFirst;
  else if (eventData.first_name) mappedData.user_data.fn = eventData.first_name;
  else if (user_data.first_name) mappedData.user_data.fn = user_data.first_name;
  else if (address.first_name) mappedData.user_data.fn = address.first_name;

  if (eventData.date_of_birth) mappedData.user_data.db = eventData.date_of_birth;
  else if (eventData.db) mappedData.user_data.db = eventData.db;
  else if (user_data.db) mappedData.user_data.db = user_data.db;

  if (eventData.gender) mappedData.user_data.ge = eventData.gender;
  else if (eventData.ge) mappedData.user_data.ge = eventData.ge;
  else if (user_data.ge) mappedData.user_data.ge = user_data.ge;

  if (eventData.phone) mappedData.user_data.ph = eventData.phone;
  else if (user_data.phone_number) mappedData.user_data.ph = user_data.phone_number;

  if (eventData.countryCode) mappedData.user_data.country = eventData.countryCode;
  else if (eventData.country) mappedData.user_data.country = eventData.country;
  else if (user_data.country) mappedData.user_data.country = user_data.country;
  else if (address.country) mappedData.user_data.country = address.country;

  if (eventData.state) mappedData.user_data.st = eventData.state;
  else if (eventData.region) mappedData.user_data.st = eventData.region;
  else if (user_data.region) mappedData.user_data.st = user_data.region;
  else if (address.region) mappedData.user_data.st = address.region;

  if (eventData.zip) mappedData.user_data.zp = eventData.zip;
  else if (eventData.postal_code) mappedData.user_data.zp = eventData.postal_code;
  else if (user_data.postal_code) mappedData.user_data.zp = user_data.postal_code;
  else if (address.postal_code) mappedData.user_data.zp = address.postal_code;

  if (eventData.city) mappedData.user_data.ct = eventData.city;
  else if (address.city) mappedData.user_data.ct = address.city;

  if (eventData.external_id) mappedData.user_data.external_id = eventData.external_id;
  else if (eventData.user_id) mappedData.user_data.external_id = eventData.user_id;
  else if (eventData.userId) mappedData.user_data.external_id = eventData.userId;

  if (eventData.ip_override) {
    mappedData.user_data.client_ip_address = eventData.ip_override.split(' ').join('').split(',')[0];
  }

  if (eventData.lead_id) mappedData.user_data.lead_id = eventData.lead_id;
  else if (eventData.leadId) mappedData.user_data.lead_id = eventData.leadId;

  if (eventData.user_agent) mappedData.user_data.client_user_agent = eventData.user_agent;
  if (eventData.madid) mappedData.user_data.madid = eventData.madid;

  if (data.userDataList) {
    data.userDataList.forEach((d) => {
      if (isValidValue(d.value)) {
        mappedData.user_data[d.name] = d.value;
      }
    });
  }

  return mappedData;
}

function determinateIsLoggingEnabled() {
  if (!data.logType) {
    return isDebug;
  }

  if (data.logType === 'no') {
    return false;
  }

  if (data.logType === 'debug') {
    return isDebug;
  }

  return data.logType === 'always';
}

function isConsentGivenOrNotRequired() {
  if (data.adStorageConsent !== 'required') return true;
  if (eventData.consent_state) return !!eventData.consent_state.ad_storage;
  const xGaGcs = eventData['x-ga-gcs'] || ''; // x-ga-gcs is a string like "G110"
  return xGaGcs[2] === '1';
}

function isValidValue(value) {
  const valueType = getType(value);
  return valueType !== 'null' && valueType !== 'undefined' && value !== '';
}
