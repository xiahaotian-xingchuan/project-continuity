import {board} from "@/lib/board";
export function GET(){return new Response(board,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"private, no-store"}});}
