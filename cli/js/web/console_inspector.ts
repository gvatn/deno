import { Console } from "./console.ts";

type PrintFunc = (x: string, isErr?: boolean) => void;

export class ConsoleInspector extends Console {
  constructor(printFunc: PrintFunc) {
      super(printFunc);
  }
}