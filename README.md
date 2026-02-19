# Yelp Conversions API Tag for Google Tag Manager Server Container

This tag allows you to send site or app events and parameters directly to the Yelp server using the [Yelp Conversions API](https://docs.developer.yelp.com/docs/conversions-api). It runs in your Google Tag Manager Server container.

## Features

- **Event Forwarding**: Send standard, custom, or GA4-inherited events to Yelp.
- **Data Normalization & Hashing**: Automatically normalizes and hashes User Data (PII) using SHA256 before sending, ensuring privacy compliance.
- **Custom Data Handling**: Supports sending conversion values, currency, content IDs, and other custom parameters.
- **Event Deduplication**: Supports `event_id` for deduplicating events.
- **Optimistic Scenario**: Option to speed up tag execution by not waiting for the API response.
- **Test Mode**: Validate your setup without affecting production data.

## Configuration

### Event Name Setup Method
Choose how the event name sent to Yelp is determined:

1. **Standard**: Select one of the standard Yelp event names from a dropdown (e.g., `Purchase`, `Add To Cart`, `Search`, `Lead`, etc.).
2. **Inherit from client**: The tag will automatically parse standard GA4 event names and map them to the corresponding Yelp events.
3. **Custom**: Manually specify a custom event name. Custom events are automatically prefixed with `custom_`.

### Event Conversion Type
Select the source of the conversion event:
- **Website**
- **Physical Store**
- **Mobile App**

### Access Token
Enter your Yelp Conversions API Access Token. You can find more information on how to obtain this in the [Yelp Documentation](https://docs.developer.yelp.com/docs/conversions-api#data-access).

### Settings

- **Use Optimistic Scenario**: If enabled, the tag will signal success to GTM immediately (`gtmOnSuccess()`) without waiting for the Yelp API response. This improves response times but obscures API errors.
- **Test Mode**: When enabled, the tag sends events with `test_event: true`. The API performs validations but does not record the conversion.

- **Server Parameters**: Manually add or override server-level parameters (e.g., `event_id`, `event_time`).
- **User Data Parameters**: Manually add or override user data parameters. The tag automatically extracts, normalizes, and hashes (SHA256) the following fields from the standard GTM Server Event Model: **Email, Phone, First Name, Last Name, City, State, Zip, Country, Gender, Date of Birth, External ID, IP Address, User Agent, and Mobile Advertising ID.**
- **Custom Data Parameters**: Manually add extra custom data properties.

### Tag Execution Consent Settings
- **Send data always**: The tag runs regardless of consent state.
- **Send data in case marketing consent given**: The tag checks for `ad_storage` consent (Google Consent Mode) and only executes if granted.


## Useful Resources

- [Yelp Conversions API Documentation](https://docs.developer.yelp.com/docs/conversions-api)
- [Step-by-step guide on how to configure Yelp tag](https://stape.io/blog/yelp-gtm-tag-setup)

## Open Source

The **Yelp Tag for GTM Server Side** is developed and maintained by the [Stape Team](https://stape.io/) under the Apache 2.0 license.
