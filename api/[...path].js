import { handleApiRequest } from "../server.mjs";

export default async function handler(request, response) {
  const handled = await handleApiRequest(request, response);

  if (!handled) {
    response.writeHead(404, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify({ code: "NOT_FOUND", message: "Rota não encontrada." }));
  }
}
