# Troubleshooting

Symptom first. Most "the client shows a 404" reports are one of the first three rows.

| Symptom | Likely cause | How to tell, and the fix |
|---|---|---|
| Client shows "not found" on every page | The service URL the client uses is missing the endpoint path, so every call 404s | Call `{service-url}/status` with the **exact URL the client uses**. The service always answers under `/service` (Connect does not strip it), so the client's `PB_SERVICE_URL` must end in `/service`. If only `{origin}/status` was reachable, you are running something else or a proxy strips the path |
| Client shows "not found" on every page, service path is right | The project has no published page for that path | Render call returns 404 code `page_not_found`. That is correct. Author and publish pages (step 10), or check the route templates match the client's URLs |
| Client shows the degraded screen | Failure outcome | The client logs the reason: `unauthorized`, `forbidden`, `wire_version`, `timeout`, `network`, `server`, `bad_route`, `bad_response`. Fix by reason below |
| `unauthorized` (401 `invalid_render_key`) | Render key differs between service and client | Compare the secrets, redeploy the side that is stale |
| `forbidden` (403 `origin_not_allowed`) | Client origin not in the service's render origins | Add it and redeploy the service; check the client sends its public origin |
| `wire_version` (426) | Client and service wire versions differ | Upgrade the older side |
| `timeout` on first requests only | Sandbox deployment cold start | Use a production-type deployment, or raise the budget in dev |
| `bad_route` (404 without `page_not_found`) | Wrong service URL, missing endpoint path, or a proxy answering | See the first row |
| Service logs "Permissions exceeded" when reaching commercetools | The API client's scopes do not include what the service requests (only possible with a hand-made client, e.g. local development) | Match the requested scope to the client, or use a client with the four required scopes. With Connect's generated client this does not occur |
| Products or prices empty, pages render | The `store` key does not exist in the project, or no price for the market | Check the store key and the market's currency and country |
| Search or listing errors | Product Search not activated on the project | Activate it |
| MC editor loads but every gateway call is 401 `invalid_token` | Issuer or audience wrong | Issuer is the project region's gateway; audience is the service's origin without a path |
| `wrong_project` from the gateway | The editor is open on a different project than the service's | Open it from the project the service serves |
| Preview frame is blank in the editor | The framing is blocked: the editor's frame sources lack the client origin, or the client forbids being framed | Add the origin to the editor's frame sources (redeploy it); allow the MC origin to frame the client |
| Preview shows published content | Token mismatch, or the query string is not forwarded | Compare the preview token in settings and the service; check the client forwards its full query string |
| Palette empty in the editor | Catalog not pushed and published | Step 8 |
| Catalog push rejected (422) | Validation violations; nothing was written | The response lists every violation |
| Authors cannot open the app | Permissions or the registered URL | Check the team's view/manage, and that the registration has the deployed URL |
| The editor's build or start fails with "Missing environment variable 'X' specified in config" | A `${env:X}` placeholder in the app's config file for a setting that is optional: the loader throws for any placeholder whose variable is not set. A local `.env` hides it, because it is not in the git checkout Connect builds | Required settings may be placeholders; optional ones must be read in the config file with an empty default. Build once without your `.env` to check |
