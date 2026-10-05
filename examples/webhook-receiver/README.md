# webhook-receiver

Verifies Nexus webhooks and hands privacy events to `@nexus/privacy`. The kit acknowledges the request, uploads the access export or runs erasure, and completes it. Rectification, restriction, and objection wait for `privacy.completeReview`.
