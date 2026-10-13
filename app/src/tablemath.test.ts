import { afterEach, describe, expect, it } from "vitest";
import en from "./locales/en";
import es from "./locales/es";
import pt from "./locales/pt";
import { useMessages } from "./i18n";
import { cellNumber, columnName, computeTable, continueSeries, evaluate, shiftFormula } from "./tablemath";

const grid = [
  ["Product", "Price", "Quantity"],
  ["Bread", "1,5", "4"],
  ["Milk", "2", "3"],
  ["Coffee", "1.250,5", "1"],
];
const read = (row: number, col: number) => cellNumber(grid[row]?.[col] ?? "");

describe("table formulas", () => {
  it("reads numbers written the Spanish way", () => {
    expect(cellNumber("3,5")).toBe(3.5);
    expect(cellNumber("1.250,5")).toBe(1250.5);
    expect(cellNumber("$ 20")).toBe(20);
    expect(cellNumber("Bread")).toBeNull();
    expect(cellNumber("")).toBeNull();
  });

  it("also reads numbers written the English way when both marks are there", () => {
    expect(cellNumber("1,250.5")).toBe(1250.5);
    // One kind of mark: read as the language writes numbers.
    expect(cellNumber("40,046", ".")).toBe(40046);
    expect(cellNumber("1.250", ".")).toBe(1.25);
    expect(cellNumber("1.250", ",")).toBe(1250);
    expect(cellNumber("40,046", ",")).toBe(40.046);
    expect(cellNumber("3.5")).toBe(3.5);
  });

  it("does arithmetic with the usual precedence", () => {
    expect(evaluate("=2+3*4", read)).toBe(14);
    expect(evaluate("=(2+3)*4", read)).toBe(20);
    expect(evaluate("=2^3^2", read)).toBe(512);
    expect(evaluate("=-3+10%", read)).toBeCloseTo(-2.9);
  });

  it("uses cells, ranges and functions in Spanish or English", () => {
    expect(evaluate("=B2*C2", read)).toBe(6);
    expect(evaluate("=SUMA(C2:C4)", read)).toBe(8);
    expect(evaluate("=sum(C2:C4)", read)).toBe(8);
    expect(evaluate("=PROMEDIO(B2:B3)", read)).toBe(1.75);
    expect(evaluate("=MAX(B2:B4; 5000)", read)).toBe(5000);
    expect(evaluate("=CONTAR(A1:C4)", read)).toBe(6);
    expect(evaluate("=REDONDEAR(10/3; 2)", read)).toBe(3.33);
  });

  it("accepts the Brazilian Portuguese names, with or without accents", () => {
    expect(evaluate("=SOMA(C2:C4)", read)).toBe(8);
    expect(evaluate("=soma(C2:C4)", read)).toBe(8);
    expect(evaluate("=MÉDIA(B2:B3)", read)).toBe(1.75);
    expect(evaluate("=MEDIA(B2:B3)", read)).toBe(1.75);
    expect(evaluate("=MÍNIMO(B2:B4)", read)).toBe(1.5);
    expect(evaluate("=MINIMO(B2:B4)", read)).toBe(1.5);
    expect(evaluate("=MÁXIMO(C2:C4)", read)).toBe(4);
    expect(evaluate("=MAXIMO(C2:C4)", read)).toBe(4);
    expect(evaluate("=CONT.NÚM(A1:C4)", read)).toBe(6);
    expect(evaluate("=cont.num(A1:C4)", read)).toBe(6);
    expect(evaluate("=ARRED(10/3; 2)", read)).toBe(3.33);
    expect(evaluate("=ABS(-4)", read)).toBe(4);
    // The cell references inside still move with rows, without touching the names.
    expect(shiftFormula("=CONT.NÚM(A1:A3)+MÉDIA(B1:B2)", "row", 0, 1, 5)).toBe("=CONT.NÚM(A2:A4)+MÉDIA(B2:B3)");
  });

  it("reports mistakes instead of guessing", () => {
    expect(() => evaluate("=2+", read)).toThrow();
    expect(() => evaluate("=1/0", read)).toThrow();
    expect(() => evaluate("=NOTHING(1)", read)).toThrow("I don't know NOTHING");
    expect(() => evaluate("=2 3", read)).toThrow();
  });

  it("computes a whole table, with formulas that use other formulas and cycles", () => {
    const cells = [["2", "", ""], ["3", "", ""]];
    const formulas = new Map([
      ["0,1", "=A1*10"],
      ["1,1", "=B1+A2"],
      ["0,2", "=C2"],
      ["1,2", "=C1"],
    ]);
    const result = computeTable(cells, formulas);
    expect(result.get("0,1")).toBe("20");
    expect(result.get("1,1")).toBe("23");
    expect(result.get("0,2")).toBe("#cycle");
  });

  it("passes errors and cycles on to the cells that use them, in any order", () => {
    const cycle = computeTable([["", "", ""]], new Map([["0,0", "=B1"], ["0,1", "=A1"], ["0,2", "=A1+1"]]));
    expect([...cycle.values()]).toEqual(["#cycle", "#cycle", "#cycle"]);
    const error = computeTable([["", ""]], new Map([["0,0", "=1/0"], ["0,1", "=A1+5"]]));
    expect(error.get("0,1")).toBe("#error");
  });

  it("shows results with the decimal mark of the language", () => {
    const formulas = new Map([["0,1", "=A1/2"]]);
    expect(computeTable([["3", ""]], formulas).get("0,1")).toBe("1.5");
    useMessages("es", es);
    expect(computeTable([["3", ""]], formulas).get("0,1")).toBe("1,5");
    expect(computeTable([["", ""]], new Map([["0,0", "=B1"], ["0,1", "=A1"]])).get("0,0")).toBe("#ciclo");
    useMessages("en", en);
  });

  it("reads a decimal comma, with ';' between arguments", () => {
    expect(evaluate("=REDONDEAR(3,456;2)", read)).toBe(3.46);
    expect(evaluate("=SUMA(1,5;2)", read)).toBe(3.5);
    expect(evaluate("=3,5*2", read)).toBe(7);
    expect(evaluate("=SUMA(1, 5)", read)).toBe(6);
    expect(() => evaluate("=1+.", read)).toThrow("invalid number");
  });

  it("keeps formulas pointing at the same cells when rows or columns move", () => {
    // A new row in the middle: everything below moves down.
    expect(shiftFormula("=A3+B1", "row", 1, 1, 5)).toBe("=A4+B1");
    // A new row right below the data: the total includes it.
    expect(shiftFormula("=SUMA(B2:B3)", "row", 3, 1, 3)).toBe("=SUMA(B2:B4)");
    // Removing a row of the range shrinks it; removing the cell marks it.
    expect(shiftFormula("=SUMA(B2:B4)", "row", 1, -1, 4)).toBe("=SUMA(B2:B3)");
    expect(shiftFormula("=A2*2", "row", 1, -1, 4)).toBe("=REF()*2");
    // Columns, without touching the function names.
    expect(shiftFormula("=SUMA(A1:B1)+C1", "col", 1, 1, 5)).toBe("=SUMA(A1:C1)+D1");
    expect(shiftFormula("=PROMEDIO(C1:C3)", "col", 0, -1, 4)).toBe("=PROMEDIO(B1:B3)");
  });

  it("names columns like a spreadsheet", () => {
    expect(columnName(0)).toBe("A");
    expect(columnName(25)).toBe("Z");
    expect(columnName(26)).toBe("AA");
  });
});

describe("series", () => {
  afterEach(() => useMessages("en", en));

  it("continues numbers by their step", () => {
    expect(continueSeries(["1", "2"], 3)).toEqual(["3", "4", "5"]);
    expect(continueSeries(["10", "20"], 2)).toEqual(["30", "40"]);
    expect(continueSeries(["0,5", "1"], 2)).toEqual(["1,5", "2"]);
    expect(continueSeries(["7"], 2)).toEqual(["8", "9"]);
    expect(continueSeries(["1", "2", "4"], 2)).toBeNull();
    // The decimal mark the person typed is kept; otherwise the language's.
    expect(continueSeries(["0.5", "1"], 2)).toEqual(["1.5", "2"]);
    expect(continueSeries(["0", "0,25"], 1)).toEqual(["0,5"]);
    expect(continueSeries(["0", "1.25"], 1)).toEqual(["2.5"]);
  });

  it("continues days and months, keeping how they were written", () => {
    expect(continueSeries(["Lunes", "Martes"], 2)).toEqual(["Miércoles", "Jueves"]);
    expect(continueSeries(["sábado"], 2)).toEqual(["domingo", "lunes"]);
    expect(continueSeries(["Noviembre"], 3)).toEqual(["Diciembre", "Enero", "Febrero"]);
    expect(continueSeries(["Ene", "Mar"], 2)).toEqual(["May", "Jul"]);
    expect(continueSeries(["ENERO", "MARZO"], 1)).toEqual(["MAYO"]);
  });

  it("continues days and months in English and Portuguese too", () => {
    expect(continueSeries(["Monday", "Tuesday"], 2)).toEqual(["Wednesday", "Thursday"]);
    expect(continueSeries(["november"], 2)).toEqual(["december", "january"]);
    expect(continueSeries(["Segunda", "Terça"], 2)).toEqual(["Quarta", "Quinta"]);
    expect(continueSeries(["sexta-feira"], 3)).toEqual(["sábado", "domingo", "segunda-feira"]);
    expect(continueSeries(["Outubro"], 2)).toEqual(["Novembro", "Dezembro"]);
  });

  it("reads a short name in the current language first", () => {
    // "Dom" is Sunday in Spanish and in Portuguese.
    useMessages("es", es);
    expect(continueSeries(["Dom"], 1)).toEqual(["Lun"]);
    useMessages("pt", pt);
    expect(continueSeries(["Dom"], 1)).toEqual(["Seg"]);
  });

  it("continues text that ends in a number", () => {
    expect(continueSeries(["Item 1", "Item 2"], 2)).toEqual(["Item 3", "Item 4"]);
    expect(continueSeries(["Chapter 09"], 2)).toEqual(["Chapter 10", "Chapter 11"]);
    expect(continueSeries(["Hello"], 2)).toBeNull();
  });
});
