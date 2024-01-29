declare module 'search-string' {
  type Transformer = (value: string) => { key: string; value: string } | false | null | undefined;

  interface TextSegment {
    text: string;
    negated: boolean;
  }

  interface Condition {
    keyword: string;
    value: string;
    negated: boolean;
  }

  interface ParsedQuery {
    [key: string]: string[];
    excluded: Record<string, string[]>;
  }

  class SearchString {
    static parse(str: string, transformTextToConditions?: Transformer[]): SearchString;
    getConditionArray(): Condition[];
    getParsedQuery(): ParsedQuery;
    getAllText(): string;
    getTextSegments(): TextSegment[];
    removeKeyword(keywordToRemove: string, negatedToRemove: boolean);
    addEntry(keyword: string, value: string, negated: boolean);
    removeEntry(keyword: string, value: string, negated: boolean);
    clone(): SearchString;
    toString(): string;
  }

  export = SearchString;
}
