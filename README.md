# BluePrints Front en Tiempo Real (STOMP)

Front end del laboratorio de blueprints en tiempo real. Construido con React y Vite, se conecta al backend Spring Boot para el CRUD de planos y usa STOMP sobre WebSocket para la colaboración en vivo entre múltiples usuarios.

---

## Cómo levantar el proyecto completo

Para que el laboratorio funcione se necesitan tres cosas corriendo al mismo tiempo: la base de datos PostgreSQL, el backend Spring Boot, y el front React.

**1. Levantar la base de datos**

Parado en la carpeta del backend (BluePrintsTR), ejecutar:

    docker compose up -d

**2. Levantar el backend**

Parado en la carpeta del backend (BluePrintsTR), ejecutar:

    mvn spring-boot:run

El backend queda disponible en http://localhost:8080

**3. Crear el archivo de variables de entorno del front**

Crear un archivo llamado **.env.local** en la raíz del proyecto front con el siguiente contenido:

    VITE_API_BASE=http://localhost:8080
    VITE_STOMP_BASE=http://localhost:8080

**4. Instalar dependencias del front**

Parado en la carpeta del front (BluePrintsTR-FRONT), ejecutar:

    npm install

**5. Levantar el front**

    npm run dev

El front queda disponible en http://localhost:5173

---

## Endpoints usados

| Método | Ruta | Descripción |
|---|---|---|
| GET | /api/v1/blueprints/{author} | Cargar tabla de planos por autor |
| GET | /api/v1/blueprints/{author}/{bpname} | Cargar puntos al abrir un plano |
| POST | /api/v1/blueprints | Crear un plano nuevo |
| PUT | /api/v1/blueprints/{author}/{bpname} | Guardar el plano completo |
| DELETE | /api/v1/blueprints/{author}/{bpname} | Eliminar un plano |

Para el tiempo real se usa el endpoint WebSocket del backend:

    ws://localhost:8080/ws-blueprints

---

## Decisiones, Tópicos STOMP

Se eligió STOMP como tecnología de tiempo real. En STOMP no existen "rooms" como en Socket.IO en su lugar se usan tópicos (topics).
Cada plano tiene su propio tópico con el siguiente formato:

    /topic/blueprints.{author}.{name}

Por ejemplo, el plano "casa1" del autor "juan" usa el tópico:

    /topic/blueprints.luiza.plano1

Cuando el usuario hace clic en el canvas, el front publica el punto en **/app/draw** con el siguiente formato:

    { "author": "luiza", "name": "plano1", "point": { "x": 100, "y": 200 } }

El backend recibe ese mensaje, persiste el punto en PostgreSQL, y lo retransmite al tópico correspondiente. Todos los clientes 
suscritos a ese tópico (es decir, todos los que tienen ese mismo plano abierto) reciben el punto y lo dibujan en su canvas automáticamente.

El aislamiento entre planos es automático si dos usuarios están en planos distintos, los mensajes de uno nunca llegan
al otro, porque cada uno está suscrito a su propio tópico.

---

## Comparativa Socket.IO vs STOMP

| Aspecto | Socket.IO | STOMP                                       |
|---|---|---------------------------------------------|
| Tipo de servidor | Servidor Node.js independiente | Integrado en Spring Boot                    |
| Concepto de agrupación | Rooms (salas) el cliente hace join-room explícito | Tópicos el cliente se suscribe a /topic/... |
| Persistencia del punto | El servidor Node debe llamar al backend Spring por HTTP | El mismo backend Spring persiste directamente |
| Número de procesos | 3 (Postgres + Spring + Node) | 2 (Postgres + Spring)                       |
| Escalabilidad horizontal | Más simple con Redis adapter | Requiere broker externo como RabbitMQ       |
| Curva de aprendizaje | API más simple (emit/on) | Requiere entender el modelo pub/sub de STOMP |
| Reconexión automática | Muy robusta out of the box | Configurable con reconnectDelay             |

**Por qué elegimos STOMP**

Se eligió STOMP porque el backend ya estaba construido en Spring Boot, lo que permitió reutilizar todo el dominio del problema
(modelo Blueprint/Point, capa de persistencia, servicios) sin necesidad de un servidor adicional ni duplicar lógica de negocio 
en otro lenguaje. Esto redujo la complejidad operativa y el riesgo de inconsistencia de datos entre dos sistemas.

**Limitación principal de STOMP**

El broker simple (SimpleBroker) que usamos no sincroniza mensajes entre múltiples instancias del servidor.

[videoFuncionamiento.mp4](imagenes/videoFuncionamiento.mp4)