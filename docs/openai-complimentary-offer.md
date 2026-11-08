# OpenAI complimentary-token model groups — v0.13.0

This release implements the **exact two groups of model IDs displayed in the user's November 2026 OpenAI data-sharing offer screenshot**. It is a **model-selection and local usage-awareness feature**, not a provider-side billing entitlement manager.

## Screenshot group 1: Up to 250,000 shared daily tokens

`gpt-5.4`, `gpt-5.2`, `gpt-5.1`, `gpt-5`, `gpt-4.1`, `gpt-4o`, `o1`, `o3`.

The allowance is combined **across the listed group** and across the organization's eligible API traffic; it is not 250k per model or per browser.

## Screenshot group 2: Up to 2,500,000 shared daily tokens

`gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5-mini`, `gpt-5-nano`, `gpt-4.1-mini`, `gpt-4.1-nano`, `gpt-4o-mini`, `o3-mini`, `o4-mini`.

Likewise, 2.5M tokens is the shared **group** allowance, not the allowance of each individual model. The two group limits are independent. The default for **new** OpenAI configurations is `gpt-5.4-mini`, an available member of the second group; the extension preserves existing saved model choices and custom model IDs. Existing GPT-6 options remain under **Other OpenAI models**, outside the two screenshot groups.

The dropdown marks historical models as deprecated or shut down based on OpenAI's current model catalog. Notably, `o1`, `o3-mini`, `o4-mini` and `gpt-4.1-nano` are not currently viable for new API calls; they remain **visible** in the catalog to faithfully represent the screenshot, but cannot be selected from the dropdown. Deprecated models may not be available to a given account, so use the existing **Verify model access** metadata check before any inference request. An alias's inclusion in a historical offer does not guarantee current API access.

## Eligibility is not enrollment

The user's screenshot says **“You're eligible for free daily usage on traffic shared with OpenAI.”** This is **not** a confirmation that traffic sharing is enabled. An organization owner must select the OpenAI organization/project data-sharing option and see **“You're enrolled for complimentary daily tokens”** before qualifying traffic can automatically receive the benefit.

The extension **does not change** OpenAI account settings, transmit an extra opt-in command to the API, or verify a project's enrollment. Its checkbox records a user attestation in local Firefox extension storage **only**, and always displays that this attestation is unverified. Using the extension does not enroll the account.

When organization/project sharing is enabled, user inputs and outputs may be used by OpenAI to improve models under OpenAI's data-sharing policy. It is optional and has privacy implications. Avoid sensitive, confidential or proprietary information in shared traffic unless you're authorized to share it.

## What the token meters actually mean

Each completed or provider-reported incomplete OpenAI Responses stream with valid `usage.input_tokens` and `usage.output_tokens` contributes to an **observed local count** for the corresponding screenshot group. No text or prompts are stored with these counts. Meters use **UTC calendar dates** and reset at `00:00 UTC` (02:00 in South Africa). The model ID, usage counts and local acknowledgment are the only data involved in this feature.

The meters **do not** know the user's organization or project, purchases, other API calls, concurrent devices, available credit, rate limits or how OpenAI's invoice treats a given call. Their values must **never** be presented as verified free balance, remaining complimentary tokens, actual cost, or proof of enrollment. A stream missing usage or a cancelled request may still incur charges that are not reflected in the local tally. Large or concurrent calls may exhaust the shared quota before the local meter catches up.

## Billing rules worth highlighting

Per OpenAI's current program documentation:
- An eligible organization/project needs a **positive API account balance**, even when complimentary tokens are available.
- Requests beyond the shared group allowance are billed at ordinary rates.
- If a **single request** crosses the remaining daily threshold, the **entire request** is billed at standard rates, not only the token overage.
- **Tool use, fine-tuning and evaluations are excluded** from the complimentary token program. In Ayarime, the optional hosted web-search toggle remains **OFF by default** and can incur extra fees.
- The user can verify genuine free-token application and costs in the OpenAI usage dashboard by service tier, comparing token consumption with cost data.

These are conditional promotional entitlements and may change. The app must not imply that a model is always free or that the counters automatically protect against charges.

## How to configure

Open the OpenAI provider in the Hub or sidebar. Choose one of the two groups in **OpenAI model catalog**, or manually type a custom model ID. Press **Save provider and model**. Open the provider settings page at https://platform.openai.com/settings/organization/data-controls/sharing and review your organization's data-sharing offer. If you intentionally enable it and confirm the enrollment message, you may also check the optional acknowledgment inside Ayarime. This latter step does not change the OpenAI account.

Review https://platform.openai.com/usage/chat-completions for authoritative usage and pricing. The separate local two-group meters update when the API reports token counts. **Avoid relying on those meters to prevent billing.**

## Official references

- https://help.openai.com/en/articles/10306912-sharing-feedback-evals-and-api-data-with-openai
- https://developers.openai.com/api/docs/models/all
- https://developers.openai.com/api/docs/models/gpt-5.4-mini
- https://platform.openai.com/usage/chat-completions

## Verification and release status

Node unit tests verify the exact 17 screenshot model IDs, two group limits, deprecated/shutdown flags, non-billing claims, self-reported enrollment, concurrent token updates and UTC rollover. Mocked Firefox Port tests verify an actual completed SSE usage event adds only provider-reported tokens to the appropriate local counter. Native Firefox smoke checks the selector, grouped options and the unselected enrollment checkbox.

These tests do **not** make paid OpenAI requests or verify account eligibility, enrollment or billing. All public release gates remain unapproved. The v0.13.0 XPI is an **unsigned field-test package**, not a signed Firefox release.
