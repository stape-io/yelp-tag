# Yelp Conversions API Tag for Google Tag Manager Server Container

Yelp conversion API tag for Google Tag Manager server container allows sending site or app events and parameters directly to Yelp server using [Yelp API](https://docs.developer.yelp.com/docs/conversions-api).

### There are three ways of sending events:

- **Standard** - select one of the standard names.
- **Inherit** from the client - tag will parse sGTM event names and match them to Yelp standard events.
- **Custom** - set a custom name.

Yelp CAPI tag automatically normalized and hashed with lowercase hex SHA256 format. All user parameters (plain text email, mobile identifier, IP address, and phone number).

Tag supports event deduplication.

### Getting started
According to Yelp Conversions API, it is required to use Access Token to send events to Yelp server.

## Open Source

Yelp Tag for GTM Server Side is developing and maintained by [Stape Team](https://stape.io/) under the Apache 2.0 license.
