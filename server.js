// Это код JavaScript стороны сервера, рассчитанный на запуск с помощью NodeJS.
// Он реализует очень простую, полностью анонимную дискуссионную группу.
// Посредством запросов POST для /chat он отправляет новые сообщения или
// с помощью запросов GET к тому же самому URL получает сообщения в формате
// "text/event-stream".
// Запрос GET к / возвращает простой HTML-файл, который содержит
// пользовательский интерфейс стороны клиента для чата.
const http = require("http");
const fs = require("fs");
const url = require("url");

// HTML-файл для чат-клиента. Используется ниже
const clientHTML = fs.readFileSync("index.html");

// Массив объектов ServerResponse, которым мы собираемся посылать события
let clients = [];

// Создать новый сервер и прослушивать порт 8080.
// Для его использования подключитесь к http://localhost:8080/
let server = new http.Server();
server.listen(8080);

// Когда сервер получает новый запрос, выполнить эту функцию
server.on("request", (request, response)=> {
  // Разобрать запрошенный URL
  let pathname = url.parse(request.url).pathname;

  // Если запрос был для "/", тогда отправить пользовательский
  // интерфейс клиентской стороны для чата
  if (pathname === "/") { //Request для chat UI
    response.writeHead(200, {"Content-Type": "text/html"}).end(clientHTML);
  }
  // В противном случае отправить ошибку 404 для любого пути кроме "/chat"
  // или для любого метода, отличающегося от "GET" и "POST"
  else if (pathname !== "/chat" || (request.method !== "GET" && request.method !== "POST")) {
    response.writeHead(404).end();
  }
  // Если запросом для /chat был GET, тогда клиент подключается
  else if (request.method === "GET") {
    acceptNewClient(request, response);
  }
  // Иначе запросом к /chat является POST для нового сообщения
  else {
    broadcastNewMessage(request, response);
  }
});
 
// Эта функция обрабатывает запросы GET для конечной точки /chat,
// которая генерируется, когда клиент создает новый объект EventSource
// (или когда EventSource автоматически повторно подключается)
function acceptNewClient(request, response) {
    // Запомнить объект ответа, чтобы ему можно было посылать
    // будущие сообщения
    clients.push(response);

    // Если клиент закрыл подключение, тогда удалить соответствующий
    // объект ответа из массива активных клиентов
    request.connection.on("end", ()=> {
      clients.splice(clients.indexOf(response), 1);
      response.end();
    });

    // Установить заголовки и отправить начальное событие чата
    // для этого одного клиента
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Connection" : "keep-alive",
      "Cache-Control": "no-cache",
    });
    response.write("event: chat\ndata: Connected\n\n");

    // Обратите внимание, что мы намеренно не вызываем здесь response.end()
    // Именно сохранение подключения открытым обеспечивает работу SSE.

}
// Эта функция вызывается в ответ на запросы POST к конечной точке /chat,
// которые клиенты посылают, когда пользователи вводят новые сообщения
async function broadcastNewMessage(request, response) {
  // Прочитать тело запроса, чтобы получить сообщение пользователя
  request.setEncoding("utf8");
  let body = "";
  for await (let chunk of request){
    body += chunk;
  }

  // После того, как тело прочитано, отправить пустой ответ
  // и закрыть подключение
  response.writeHead(200).end();

  // Сформатировать сообщение в формате text/event-stream, снабжая
  // каждую строку префиксом "data: ".
  let message = "data: " + body.replace("\n", "\ndata: ");

  // Предоставить данным сообщения префикс, который определяет
  // их как событие "chat", и снабдить их суффиксом в виде двух
  // символов новой строки, которые помечают конец события
  let event = `event: chat\n${message}\n\n`;

  // Теперь отправить это событие всем прослушивающим клиентам
  clients.forEach(client => client.write(event));

}