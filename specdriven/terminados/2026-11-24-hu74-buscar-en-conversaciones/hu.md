# HU74 — Buscar dentro de las conversaciones

## Historia

**Como** vendedor o administrador que atiende la bandeja,
**quiero** buscar una palabra o frase en el texto de los mensajes de todas mis conversaciones,
**para** encontrar rápido un chat en el que se habló de algo (un pedido, un precio, una dirección) aunque no recuerde el nombre ni el número del cliente.

## Contexto (estado actual)

- El buscador de la bandeja (`frontend/src/app/pages/inbox/inbox.ts`) solo busca por nombre, número/identificador y el **último** mensaje (`lastMessagePreview`) de cada chat (`backend/src/conversations/conversations.service.ts`, `listConversations`).
- Un mensaje antiguo no se encuentra: hay que abrir chat por chat.

## Propuesta

1. El mismo buscador también busca en el texto de todos los mensajes (texto, pie de adjunto, transcripción de audio y asunto de correo) de la empresa.
2. La lista muestra, en los chats encontrados por un mensaje, un fragmento del mensaje con la palabra resaltada.
3. Al abrir ese chat, la conversación salta al mensaje encontrado y lo resalta un momento.

## Criterios de aceptación (borrador)

- C1: buscar una palabra que solo aparece en un mensaje antiguo devuelve su conversación, con el fragmento.
- C2: nunca aparecen mensajes de otra empresa.
- C3: al abrir el chat encontrado, se ve y se resalta el mensaje.
