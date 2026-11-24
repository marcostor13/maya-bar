# Textos para pegar en la nueva solicitud (en inglés)

Reemplaza `<<REVIEWER_EMAIL>>` y `<<REVIEWER_PASSWORD>>` por la cuenta de prueba
de Maya para el revisor.

## Instrucciones generales para revisores

```
Maya CRM (https://mayacrm.site) is a web CRM for small businesses. Each business
connects its own Facebook Page and Instagram professional account and answers
customer messages from a shared inbox, together with an optional AI assistant.

Test account (web app, desktop browser):
  URL: https://mayacrm.site/login
  Email: <<REVIEWER_EMAIL>>
  Password: <<REVIEWER_PASSWORD>>

The app UI is in Spanish; the screencasts include English captions that explain
every screen and button.

Messenger (Video A): Settings > Messenger > "Conectar con Facebook" (Connect with
Facebook) runs Facebook Login and lists the user's Pages; the selected Page is
connected and "Suscribir webhook" (Subscribe webhook) subscribes it to the
"messages" field. Incoming messages arrive in "Bandeja de entrada" (Inbox),
where the agent replies with the "Enviar" (Send) button. The video shows the
same reply delivered in Messenger.

Instagram (Video B): Settings > Instagram > "Conectar con Instagram" (Connect
with Instagram) runs Instagram Login. The connected account's username and
picture are shown. Direct messages arrive in the Inbox and the reply sent from
Maya is shown delivered in Instagram Direct.

We only read and send messages in conversations that customers start with the
business, and we do not use the data for advertising.
```

## pages_show_list

```
After Facebook Login, Maya calls /me/accounts to list the Pages the user manages
so they can choose which Page to connect to their Maya inbox. Only the Page the
user selects is stored. Shown in Video A, scenes 3–5.
```

## pages_manage_metadata

```
When a Page is connected, Maya subscribes it to our webhook
(POST /{page-id}/subscribed_apps with the "messages" field) from the
"Subscribe webhook" button, so that new messages sent to the Page are delivered
to the business inbox in real time. Video A shows the subscription (scene 6) and
a webhook event from that same Page arriving in the inbox (scenes 7–8).
```

## pages_messaging

```
Business agents (or the business's AI assistant) reply to customers who wrote
to the Page, from Maya's shared inbox, within the standard messaging window.
Video A shows a reply sent from Maya (scene 9) and the same message delivered in
the customer's Messenger (scene 10).
```

## instagram_business_basic

```
After Instagram Login, Maya reads the professional account's ID, username, name
and profile picture to identify the connected account in the settings and in
the inbox, and the sender's username for each conversation. Video B, scenes 2–3
and 5.
```

## instagram_business_manage_messages

```
Maya receives Direct messages sent to the connected Instagram professional
account and lets the business reply from the shared inbox. Video B shows a
customer DM arriving in Maya (scenes 4–5), the reply sent from Maya (scene 6)
and the same reply delivered in Instagram Direct (scene 7).
```
