const createRegex = require('createRegex');
const getAllEventData = require('getAllEventData');
const getContainerVersion = require('getContainerVersion');
const getRequestHeader = require('getRequestHeader');
const getTimestampMillis = require('getTimestampMillis');
const getType = require('getType');
const JSON = require('JSON');
const logToConsole = require('logToConsole');
const makeInteger = require('makeInteger');
const makeNumber = require('makeNumber');
const makeString = require('makeString');
const Math = require('Math');
const Object = require('Object');
const sendHttpRequest = require('sendHttpRequest');
const sha256Sync = require('sha256Sync');

/*==============================================================================
==============================================================================*/

const containerVersion = getContainerVersion();
const isDebug = containerVersion.debugMode;
const isLoggingEnabled = determinateIsLoggingEnabled();
const traceId = getRequestHeader('trace-id');

const eventData = getAllEventData();

if (shouldExitEarly(data, eventData)) {
  return data.gtmOnSuccess();
}

sendTrackRequest(mapEvent(eventData, data));

if (data.useOptimisticScenario) {
  return data.gtmOnSuccess();
}

/*==============================================================================
  Vendor related functions
==============================================================================*/

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
        if (statusCode >= 200 && statusCode < 400) return data.gtmOnSuccess();
        return data.gtmOnFailure();
      }
    },
    {
      headers: {
        Authorization: 'Bearer ' + data.accessToken,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      method: 'POST'
    },
    JSON.stringify(postBody)
  );
}

function getPostUrl() {
  return 'https://api.yelp.com/v3/conversion/event';
}

function getEventName(eventData, data) {
  const addCustomPrefix = (eventName) => {
    return eventName.indexOf('custom_') === 0 ? eventName : 'custom_' + eventName;
  };

  if (data.eventType === 'inherit') {
    const eventName = eventData.event_name;
    const gaToEventName = {
      page_view: 'custom_page_view',
      'gtm.dom': 'custom_page_view',
      add_to_cart: 'add_to_cart',
      purchase: 'purchase',
      add_to_wishlist: 'add_to_wishlist',
      begin_checkout: 'checkout',
      add_payment_info: 'add_payment_info',
      view_item: 'view_content',
      view_item_list: 'view_content',
      search: 'search',
      sign_up: 'signup',
      generate_lead: 'lead',

      'gtm4wp.addProductToCartEEC': 'add_to_cart',
      'gtm4wp.productClickEEC': 'view_content',
      'gtm4wp.checkoutStepEEC': 'checkout',
      'gtm4wp.orderCompletedEEC': 'purchase'
    };

    return gaToEventName[eventName] || addCustomPrefix(eventName);
  }

  return data.eventType === 'standard'
    ? data.eventNameStandard
    : addCustomPrefix(data.eventNameCustom);
}

function mapEvent(eventData, data) {
  let mappedData = {
    user_data: {},
    custom_data: {}
  };
  const event = {
    event: mappedData,
    test_event: data.validate
  };

  mappedData = addServerData(eventData, mappedData);
  mappedData = addUserData(eventData, mappedData);
  mappedData = addCustomData(eventData, mappedData);
  mappedData = hashDataIfNeeded(mappedData);

  return event;
}

function addCustomData(eventData, mappedData) {
  let currencyFromItems = '';
  let valueFromItems = 0;

  if (eventData.items && eventData.items[0]) {
    mappedData.custom_data.contents = [];
    currencyFromItems = eventData.items[0].currency;

    if (!eventData.items[1]) {
      if (eventData.items[0].id)
        mappedData.custom_data.content_ids = [makeString(eventData.items[0].item_id)];

      if (isValidValue(eventData.items[0].price)) {
        const quantity = makeInteger(eventData.items[0].quantity);
        const price = makeNumber(eventData.items[0].price);
        mappedData.custom_data.value = quantity ? quantity * price : price;
      }
    }

    const itemIdKey = data.itemIdKey ? data.itemIdKey : 'item_id';
    eventData.items.forEach((d) => {
      let content = {};
      if (d[itemIdKey]) content.id = makeString(d[itemIdKey]);
      if (d.quantity) content.quantity = makeInteger(d.quantity);

      if (isValidValue(d.price)) {
        content.item_price = makeNumber(d.price);
        valueFromItems += d.quantity ? d.quantity * content.item_price : content.item_price;
      }

      mappedData.custom_data.contents.push(content);
    });
  }

  const value = eventData['x-ga-mp1-ev'] || eventData['x-ga-mp1-tr'] || eventData.value;
  if (isValidValue(value)) mappedData.custom_data.value = makeNumber(value);

  const currency = eventData.currency || currencyFromItems;
  if (currency) mappedData.custom_data.currency = makeString(currency);

  if (eventData.content_category)
    mappedData.custom_data.content_category = eventData.content_category;
  if (eventData.search_term) mappedData.custom_data.search_string = eventData.search_term;
  if (eventData.transaction_id)
    mappedData.custom_data.order_id = makeString(eventData.transaction_id);

  if (mappedData.event_name === 'purchase') {
    if (!mappedData.custom_data.currency) mappedData.custom_data.currency = 'USD';
    if (!mappedData.custom_data.value)
      mappedData.custom_data.value = valueFromItems ? valueFromItems : 0;
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
  mappedData.integration = 'stape';

  const eventId = eventData.event_id || eventData.transaction_id;
  if (eventId) mappedData.event_id = makeString(eventId);

  if (data.serverDataList) {
    data.serverDataList.forEach((d) => {
      if (isValidValue(d.value)) {
        mappedData[d.name] = d.value;
      }
    });
  }

  return mappedData;
}

function normalizeBasedOnSchemaKey(schemaKey, identifierValue) {
  const normalizePhoneNumber = (phoneNumber) => {
    if (!phoneNumber) return phoneNumber;
    const nonDigitsRegex = createRegex('[^0-9]', 'g');
    phoneNumber = makeString(phoneNumber).replace(nonDigitsRegex, '');
    return phoneNumber;
  };
  const removeWhiteSpace = (value) => {
    if (!value) return value;
    const whiteSpaceRegex = createRegex('\\s', 'g');
    return makeString(value).replace(whiteSpaceRegex, '');
  };

  if (!schemaKey || !identifierValue) return identifierValue;
  if (identifierValue === 'undefined' || identifierValue === 'null') return undefined;

  const type = getType(identifierValue);

  if (type === 'array') {
    return identifierValue.map((val) => normalizeBasedOnSchemaKey(schemaKey, val));
  }

  if (type === 'object') {
    return Object.keys(identifierValue).reduce((acc, val) => {
      acc[val] = normalizeBasedOnSchemaKey(schemaKey, identifierValue[val]);
      return acc;
    }, {});
  }

  if (isHashed(identifierValue)) return identifierValue;

  switch (schemaKey) {
    case 'ph':
      return normalizePhoneNumber(identifierValue);
    case 'ct':
    case 'fn':
    case 'ln':
      return removeWhiteSpace(identifierValue);
    default:
      return identifierValue;
  }
}

function hashDataIfNeeded(mappedData) {
  const fieldsToHash = [
    'em',
    'fn',
    'ln',
    'db',
    'ge',
    'ph',
    'country',
    'st',
    'zp',
    'ct',
    'external_id'
  ];
  const fieldsToArray = ['em', 'ph', 'country', 'st', 'zp', 'ct', 'external_id'];

  for (let key in mappedData.user_data) {
    if (fieldsToHash.indexOf(key) !== -1) {
      const type = getType(mappedData.user_data[key]);
      if (fieldsToArray.indexOf(key) !== -1 && type !== 'object' && type !== 'array') {
        mappedData.user_data[key] = [mappedData.user_data[key]];
      }
      mappedData.user_data[key] = normalizeBasedOnSchemaKey(key, mappedData.user_data[key]);
      mappedData.user_data[key] = hashData(mappedData.user_data[key]);
    }
  }
  return mappedData;
}

function addUserData(eventData, mappedData) {
  const user_data = eventData.user_data || {};
  const address = user_data.address || {};

  const emails = getEmailAddressesFromEventData(eventData);
  if (emails.length) mappedData.user_data.em = emails;

  const phones = getPhoneNumbersFromEventData(eventData);
  if (phones.length) mappedData.user_data.ph = phones;

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
    mappedData.user_data.client_ip_address = eventData.ip_override
      .split(' ')
      .join('')
      .split(',')[0];
  }

  if (eventData.lead_id) mappedData.user_data.lead_id = eventData.lead_id;
  else if (eventData.leadId) mappedData.user_data.lead_id = eventData.leadId;

  if (eventData.user_agent) mappedData.user_data.client_user_agent = eventData.user_agent;

  const mobileDeviceId = eventData['x-ga-resettable_device_id'];
  if (mobileDeviceId && mobileDeviceId !== '00000000-0000-0000-0000-000000000000') {
    mappedData.user_data.madid = mobileDeviceId;
  }

  if (data.userDataList) {
    data.userDataList.forEach((d) => {
      if (isValidValue(d.value)) {
        mappedData.user_data[d.name] = d.value;
      }
    });
  }

  return mappedData;
}

function getEmailAddressesFromEventData(eventData) {
  const eventDataUserData = eventData.user_data || {};

  const email =
    eventDataUserData.email ||
    eventDataUserData.email_address ||
    eventDataUserData.sha256_email ||
    eventDataUserData.sha256_email_address;

  const emailType = getType(email);

  if (emailType === 'string') return [email];
  else if (emailType === 'array') return email.length > 0 ? email : [];
  else if (emailType === 'object') {
    const emailsFromObject = Object.values(email);
    if (emailsFromObject.length) return emailsFromObject;
  }

  return [];
}

function getPhoneNumbersFromEventData(eventData) {
  const eventDataUserData = eventData.user_data || {};

  const phone =
    eventDataUserData.phone ||
    eventDataUserData.phone_number ||
    eventDataUserData.sha256_phone ||
    eventDataUserData.sha256_phone_number;

  const phoneType = getType(phone);

  if (phoneType === 'string') return [phone];
  else if (phoneType === 'array') return phone.length > 0 ? phone : [];
  else if (phoneType === 'object') {
    const phonesFromObject = Object.values(phone);
    if (phonesFromObject.length) return phonesFromObject;
  }

  return [];
}

/*==============================================================================
  Helpers
==============================================================================*/

function isHashed(value) {
  if (!value) return false;
  return makeString(value).match('^[A-Fa-f0-9]{64}$') !== null;
}

function hashData(value) {
  if (!value) return value;

  const type = getType(value);

  if (value === 'undefined' || value === 'null') return undefined;

  if (type === 'array') {
    return value.map((val) => hashData(val));
  }

  if (type === 'object') {
    return Object.keys(value).reduce((acc, val) => {
      acc[val] = hashData(value[val]);
      return acc;
    }, {});
  }

  if (isHashed(value)) return value;

  return sha256Sync(makeString(value).trim().toLowerCase(), {
    outputEncoding: 'hex'
  });
}

function shouldExitEarly(data, eventData) {
  if (!isConsentGivenOrNotRequired(data, eventData)) return true;

  const url = getUrl(eventData);
  if (url && url.lastIndexOf('https://gtm-msr.appspot.com/', 0) === 0) return true;

  return false;
}

function getUrl(eventData) {
  return eventData.page_location || getRequestHeader('referer') || eventData.page_referrer;
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

function isConsentGivenOrNotRequired(data, eventData) {
  if (data.adStorageConsent !== 'required') return true;
  if (eventData.consent_state) return !!eventData.consent_state.ad_storage;
  const xGaGcs = eventData['x-ga-gcs'] || ''; // x-ga-gcs is a string like "G110"
  return xGaGcs[2] === '1';
}

function isValidValue(value) {
  const valueType = getType(value);
  return valueType !== 'null' && valueType !== 'undefined' && value !== '' && value === value;
}
