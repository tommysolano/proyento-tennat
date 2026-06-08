# Reputacion

## Alcance

Fase 10 implementa overview por empresa, solicitudes de resena, reviews,
testimonios, widgets y encuestas de satisfaccion. Todos los documentos
persisten `companyId`; las operaciones privadas derivan tenant y alcance desde
JWT. SUPERVISOR y CALLCENTER quedan limitados por contactos de equipo o
asignados.

## Analytics

`GET /api/reputation/overview` entrega rating promedio, reviews totales,
pendientes, publicadas y negativas, NPS/CSAT promedio, testimonios, cupones y
referidos. No mezcla empresas.

## Seguridad publica

Los links de resena usan tokens aleatorios de 256 bits. Slugs de widgets y
encuestas son globales. Las rutas publicas resuelven tenant desde token/slug,
validan empresa, estado y entitlement, aplican rate limit, guardan IP hasheada
y no exponen metadata ni contactos.

## Limitaciones

No hay integracion real con Google Reviews, Facebook Reviews, Trustpilot,
WhatsApp, email o SMS. Las fuentes externas son placeholders.
