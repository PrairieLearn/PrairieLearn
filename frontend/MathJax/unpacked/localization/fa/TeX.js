/* -*- Mode: Javascript; indent-tabs-mode:nil; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */

/*************************************************************
 *
 *  MathJax/localization/fa/TeX.js
 *
 *  Copyright (c) 2009-2015 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 */

MathJax.Localization.addTranslation("fa","TeX",{
        version: "2.6.0",
        isLoaded: true,
        strings: {
          ExtraOpenMissingClose: "\u0622\u06A9\u0648\u0644\u0627\u062F \u0628\u0627\u0632 \u0627\u0636\u0627\u0641\u06CC \u06CC\u0627 \u0641\u0642\u062F\u0627\u0646 \u0622\u06A9\u0648\u0644\u0627\u062F \u0628\u0633\u062A\u0647",
          ExtraCloseMissingOpen: "\u0622\u06A9\u0648\u0644\u0627\u062F \u0628\u0633\u062A\u0647\u0654 \u0627\u0636\u0627\u0641\u0647 \u06CC\u0627 \u0641\u0642\u062F\u0627\u0646 \u0622\u06A9\u0648\u0644\u0627\u062F \u0628\u0627\u0632",
          MissingLeftExtraRight: "\u0641\u0642\u062F\u0627\u0646 \u200E\\left \u06CC\u0627 \u200E\\right \u0627\u0636\u0627\u0641\u06CC",
          MissingScript: "\u0641\u0642\u062F\u0627\u0646 \u0646\u0634\u0627\u0646\u0648\u0646\u062F \u0628\u0627\u0644\u0627\u0645\u062A\u0646 \u06CC\u0627 \u0632\u06CC\u0631\u0645\u062A\u0646",
          ExtraLeftMissingRight: "\u200E\\left \u0627\u0636\u0627\u0641\u06CC \u06CC\u0627 \u0641\u0642\u062F\u0627\u0646 \u200E\\right",
          Misplaced: "%1 \u0646\u0627\u0628\u062C\u0627",
          MissingOpenForSub: "\u0641\u0642\u062F\u0627\u0646 \u0622\u06A9\u0648\u0644\u0627\u062F \u0628\u0627\u0632 \u0628\u0631\u0627\u06CC \u0632\u06CC\u0631\u0645\u062A\u0646",
          MissingOpenForSup: "\u0622\u06A9\u0648\u0644\u0627\u062F \u0628\u0627\u0632 \u06AF\u0645\u200C\u0634\u062F\u0647 \u0628\u0631\u0627\u06CC \u0628\u0627\u0644\u0627\u0645\u062A\u0646",
          AmbiguousUseOf: "\u0627\u0633\u062A\u0641\u0627\u062F\u0647\u0654 \u0645\u0628\u0647\u0645 \u0627\u0632 \u200E%1",
          EnvBadEnd: "\u200E\\begin{%1}\u200E \u067E\u0627\u06CC\u0627\u0646\u200C\u06CC\u0627\u0641\u062A\u0647 \u0628\u0627 \u200E\\end{%2}\u200E",
          EnvMissingEnd: "\u200E\\end{%1}\u200E \u06AF\u0645\u200C\u0634\u062F\u0647",
          MissingBoxFor: "\u062C\u0639\u0628\u0647\u0654 \u06AF\u0645\u200C\u0634\u062F\u0647 \u0628\u0631\u0627\u06CC %1",
          MissingCloseBrace: "\u0622\u06A9\u0648\u0644\u0627\u062F \u0628\u0633\u062A\u0647\u0654 \u0645\u0641\u0642\u0648\u062F",
          UndefinedControlSequence: "\u062F\u0646\u0628\u0627\u0644\u0647\u0654 \u06A9\u0646\u062A\u0631\u0644 \u062A\u0639\u0631\u06CC\u0641\u200C\u0646\u0634\u062F\u0647\u0654 %1",
          DoubleExponent: "\u062A\u0648\u0627\u0646 \u062F\u0648\u0645: \u0627\u0632 \u0622\u06A9\u0648\u0644\u0627\u062F \u0628\u0631\u0627\u06CC \u0631\u0648\u0634\u0646\u200C\u0633\u0627\u0632\u06CC \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F",
          DoubleSubscripts: "\u0632\u06CC\u0631\u0645\u062A\u0646 \u062F\u0648\u0645: \u0627\u0632 \u0622\u06A9\u0648\u0644\u0627\u062F \u0628\u0631\u0627\u06CC \u0631\u0648\u0634\u0646\u200C\u0633\u0627\u0632\u06CC \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F",
          DoubleExponentPrime: "\u062A\u0648\u0627\u0646 \u062F\u0648 \u0645\u0648\u062C\u0628 \u062A\u0648\u0627\u0646 \u0645\u0636\u0627\u0639\u0641 \u0634\u062F: \u0627\u0632 \u0622\u06A9\u0648\u0644\u0627\u062F \u0628\u0631\u0627\u06CC \u0631\u0648\u0634\u0646\u200C\u0633\u0627\u0632\u06CC \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F",
          CantUseHash1: "\u0634\u0645\u0627 \u0646\u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u06CC\u062F \u00AB\u0645\u0627\u06A9\u0631\u0648 \u0646\u0648\u06CC\u0633\u0647\u0654 \u067E\u0627\u0631\u0627\u0645\u062A\u0631 #\u00BB \u062F\u0631 \u062D\u0627\u0644\u062A \u0631\u06CC\u0627\u0636\u06CC \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F",
          MisplacedMiddle: "\u200E%1 \u0645\u06CC\u200C\u0628\u0627\u06CC\u0633\u062A \u062F\u0631\u0648\u0646 \u200E\\left \u0648 \u200E\\right \u0646\u0648\u0634\u062A\u0647\u200C\u0634\u0648\u062F",
          MisplacedLimits: "\u200E%1 \u0641\u0642\u0637 \u062F\u0631 \u0639\u0645\u0644\u06AF\u0631\u0647\u0627 \u0645\u062C\u0627\u0632 \u0627\u0633\u062A",
          MisplacedMoveRoot: "\u200E%1 \u062A\u0646\u0647\u0627 \u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u062F \u062F\u0631\u0648\u0646 \u06CC\u06A9 \u0631\u06CC\u0634\u0647 \u0638\u0627\u0647\u0631 \u0634\u0648\u062F",
          MultipleCommand: "\u200E%1 \u0686\u0646\u062F\u06AF\u0627\u0646\u0647",
          IntegerArg: "\u0646\u0634\u0627\u0646\u0648\u0646\u062F \u200E%1 \u0628\u0627\u06CC\u062F \u0639\u062F\u062F \u0635\u062D\u06CC\u062D \u0628\u0627\u0634\u062F",
          NotMathMLToken: "%1 \u06CC\u06A9 \u0639\u0646\u0635\u0631 \u0646\u0634\u0627\u0646 \u0646\u06CC\u0633\u062A",
          InvalidMathMLAttr: "\u0648\u06CC\u0698\u06AF\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631 MathML: %1",
          UnknownAttrForElement: "%1 \u06CC\u06A9 \u0648\u06CC\u0698\u06AF\u06CC \u0634\u0646\u0627\u062E\u062A\u0647\u200C\u0634\u062F\u0647 \u0628\u0631\u0627\u06CC %2 \u0646\u06CC\u0633\u062A",
          MaxMacroSub1: "\u0627\u0632 \u0628\u06CC\u0634\u06CC\u0646\u0647\u0654 \u0634\u0645\u0627\u0631 \u062C\u0627\u06CC\u06AF\u0632\u06CC\u0646\u06CC \u0645\u0627\u06A9\u0631\u0648\u0647\u0627\u06CC MathJax \u0639\u0628\u0648\u0631 \u0634\u062F\u0647\u200C\u0627\u0633\u062A\u061B \u0622\u06CC\u0627 \u06CC\u06A9 \u0641\u0631\u0627\u062E\u0648\u0627\u0646\u06CC \u0628\u0627\u0632\u06AF\u0634\u062A\u06CC \u0648\u062C\u0648\u062F \u062F\u0627\u0631\u062F\u061F",
          MaxMacroSub2: "\u0627\u0632 \u0634\u0645\u0627\u0631 \u0628\u06CC\u0634\u06CC\u0646\u0647\u0654 \u062A\u0639\u062F\u0627\u062F \u062C\u0627\u06CC\u06AF\u0632\u06CC\u0646\u06CC MathJax \u0639\u0628\u0648\u0631 \u0634\u062F\u0647\u200C\u0627\u0633\u062A\u061B \u0622\u06CC\u0627 \u06CC\u06A9 \u0645\u062D\u06CC\u0637 \u0644\u06CC\u062A\u06A9 \u0628\u0627\u0632\u0634\u062A\u06AF\u06CC \u0645\u0648\u062C\u0648\u062F \u0627\u0633\u062A\u061F",
          MissingArgFor: "\u0646\u0634\u0627\u0646\u0648\u0646\u062F \u06AF\u0645\u200C\u0634\u062F\u0647 \u0628\u0631\u0627\u06CC %1",
          ExtraAlignTab: "\u0628\u0631\u06AF\u0647\u0654 \u0686\u06CC\u0646\u0634 \u0627\u0636\u0627\u0641\u06CC \u062F\u0631 \u0645\u062A\u0646 \u200E\\cases",
          BracketMustBeDimension: "\u0622\u0631\u06AF\u0648\u0645\u0627\u0646 \u0622\u06A9\u0648\u0644\u0627\u062F \u200E%1 \u0645\u06CC\u200C\u0628\u0627\u06CC\u0633\u062A \u06CC\u06A9 \u0628\u0639\u062F \u0628\u0627\u0634\u062F",
          InvalidEnv: " \u0646\u0627\u0645 \u0645\u062D\u06CC\u0637 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u00AB%1\u00BB",
          UnknownEnv: "\u0645\u062D\u06CC\u0637 \u0646\u0627\u0634\u0646\u0627\u062E\u062A\u0647 \u00AB%1\u00BB",
          ExtraCloseLooking: "\u0622\u06A9\u0648\u0644\u0627\u062F \u0628\u0633\u062A\u0647\u0654 \u0627\u0636\u0627\u0641\u06CC \u0647\u0646\u06AF\u0627\u0645 \u062C\u0633\u062A\u062C\u0648\u06CC %1",
          MissingCloseBracket: "\u00AB]\u00BB \u0628\u0633\u062A\u0647 \u0628\u0631\u0627\u06CC \u0646\u0634\u0627\u0646\u0648\u0646\u062F \u200E%1 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
          MissingOrUnrecognizedDelim: "\u062C\u062F\u0627\u06A9\u0646\u0646\u062F\u0647 \u06AF\u0645\u200C\u0634\u062F\u0647 \u06CC\u0627 \u0646\u0627\u0634\u0646\u0627\u062E\u062A\u0647 \u0628\u0631\u0627\u06CC \u200E%1",
          MissingDimOrUnits: "\u0627\u0628\u0639\u0627\u062F \u06CC\u0627 \u0648\u0627\u062D\u062F \u06AF\u0645\u200C\u0634\u062F\u0647 \u0628\u0631\u0627\u06CC \u200E%1",
          TokenNotFoundForCommand: "%1 \u0628\u0631\u0627\u06CC %2 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
          MathNotTerminated: "\u0631\u06CC\u0627\u0636\u06CC \u062F\u0631 \u062C\u0639\u0628\u0647\u0654 \u0645\u062A\u0646 \u067E\u0627\u06CC\u0627\u0646 \u0646\u06CC\u0627\u0641\u062A\u0647\u200C\u0627\u0633\u062A",
          IllegalMacroParam: "\u0627\u0631\u062C\u0627\u0639 \u067E\u0627\u0631\u0627\u0645\u062A\u0631 \u0645\u0627\u06A9\u0631\u0648\u06CC \u0646\u0627\u0645\u062C\u0627\u0632",
          MaxBufferSize: "\u0627\u0646\u062F\u0627\u0632\u0647\u0654 \u0645\u06CC\u0627\u0646\u06AF\u06CC\u0631 \u062F\u0627\u062E\u0644\u06CC MathJax \u06AF\u0630\u0634\u062A\u0647 \u0634\u062F\u0647\u061B \u0622\u06CC\u0627 \u06CC\u06A9 \u0641\u0631\u0627\u062E\u0648\u0627\u0646\u06CC \u0645\u0627\u06A9\u0631\u0648\u06CC \u0628\u0627\u0632\u06AF\u0634\u062A\u06CC \u0648\u062C\u0648\u062F \u062F\u0627\u0631\u062F\u061F",
          CommandNotAllowedInEnv: "\u200E%1 \u062F\u0631 \u0645\u062D\u06CC\u0637 \u200E%2 \u0645\u062C\u0627\u0632 \u0646\u06CC\u0633\u062A",
          MultipleLabel: "\u0628\u0631\u0686\u0633\u067E \u00AB%1\u00BB \u0686\u0646\u062F\u0628\u0627\u0631 \u062A\u0639\u0631\u06CC\u0641\u200C\u0634\u062F\u0647",
          CommandAtTheBeginingOfLine: "%1 \u0628\u0627\u06CC\u062F \u062F\u0631 \u0634\u0631\u0648\u0639 \u062E\u0637 \u0628\u06CC\u0627\u06CC\u062F",
          IllegalAlign: "\u0686\u06CC\u0646\u0634 \u0645\u0634\u062E\u0635\u200C\u0634\u062F\u0647\u0654 \u0646\u0627\u0645\u062C\u0627\u0632 \u062F\u0631 \u200E%1",
          BadMathStyleFor: "\u0633\u0628\u06A9 \u0628\u062F \u0631\u06CC\u0627\u0636\u06CC \u0628\u0631\u0627\u06CC \u200E%1",
          PositiveIntegerArg: "\u0646\u0634\u0627\u0646\u0648\u0646\u062F \u0628\u0647 \u200E%1 \u0628\u0627\u06CC\u062F \u06CC\u06A9 \u0639\u062F\u062F \u0645\u062B\u0628\u062A \u0628\u0627\u0634\u062F",
          ErroneousNestingEq: "\u0633\u0627\u062E\u062A\u0627\u0631\u0647\u0627\u06CC \u0627\u0634\u062A\u0628\u0627\u0647 \u062A\u0648\u062F\u0631\u062A\u0648\u06CC \u0645\u0639\u0627\u062F\u0644\u0647",
          MultlineRowsOneCol: "\u0633\u0637\u0631 \u062F\u0631\u0648\u0646 \u0645\u062D\u06CC\u0637 %1 \u0645\u06CC\u200C\u0628\u0627\u06CC\u0633\u062A \u062F\u0642\u06CC\u0642\u0627\u064B \u06CC\u06A9 \u0633\u062A\u0648\u0646 \u062F\u0627\u0634\u062A\u0647 \u0628\u0627\u0634\u062F",
          MultipleBBoxProperty: "%1 \u062F\u0648\u0628\u0627\u0631 \u062F\u0631 \u200E%2 \u062A\u0639\u0631\u06CC\u0641 \u0634\u062F\u0647\u200C\u0627\u0633\u062A",
          InvalidBBoxProperty: "'%1' \u0628\u0647 \u0646\u0638\u0631 \u06CC\u06A9 \u0631\u0646\u06AF\u060C \u0627\u0646\u062F\u0627\u0632\u0647\u0654 \u0628\u0627\u0644\u0634\u062A\u06A9 \u06CC\u0627 \u0633\u0628\u06A9 \u0628\u0647 \u0646\u0638\u0631 \u0646\u0645\u06CC\u200C\u0631\u0633\u062F",
          ExtraEndMissingBegin: "\u200E%1 \u0627\u0636\u0627\u0641\u06CC \u06CC\u0627 \\begingroup \u06AF\u0645\u200C\u0634\u062F\u0647",
          GlobalNotFollowedBy: "\u200E%1 \u0628\u0647 \u062F\u0646\u0628\u0627\u0644 \u200E\\let\u060C \u200E\\def \u06CC\u0627 \u200E\\newcommand \u0646\u06CC\u0627\u0645\u062F\u0647\u200C\u0627\u0633\u062A",
          UndefinedColorModel: "\u0645\u062F\u0644 \u0631\u0646\u06AF\u06CC '%1' \u062A\u0639\u0631\u06CC\u0641 \u0646\u0634\u062F\u0647\u200C\u0627\u0633\u062A",
          ModelArg1: "\u0645\u0642\u0627\u062F\u06CC\u0631 \u0631\u0646\u06AF\u06CC \u0628\u0631\u0627\u06CC \u0645\u062F\u0644 %1 \u0646\u06CC\u0627\u0632\u0645\u0646\u062F \u06F3 \u0639\u062F\u062F \u0627\u0633\u062A",
          InvalidDecimalNumber: "\u0639\u062F\u062F \u0627\u0639\u0634\u0627\u0631\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631",
          ModelArg2: "\u0645\u0642\u0627\u062F\u06CC\u0631 \u0631\u0646\u06AF\u06CC \u0628\u0631\u0627\u06CC \u0645\u062F\u0644 %1 \u0645\u06CC\u200C\u0628\u0627\u06CC\u0633\u062A \u0628\u06CC\u0646 %2 \u0648 %3 \u0628\u0627\u0634\u062F",
          InvalidNumber: "\u0639\u062F\u062F \u0646\u0627\u0645\u0639\u062A\u0628\u0631",
          NewextarrowArg1: "\u0646\u0634\u0627\u0648\u0646\u062F \u0627\u0648\u0644 \u0628\u0647 \u200E%1 \u0645\u06CC\u200C\u0628\u0627\u06CC\u0633\u062A \u06CC\u06A9 \u0646\u0627\u0645 \u06A9\u0646\u062A\u0631\u0644\u06CC \u062F\u0646\u0628\u0627\u0644\u0647 \u0628\u0627\u0634\u062F",
          NewextarrowArg2: "\u0646\u0634\u0646\u0627\u0648\u0646\u062F \u062F\u0648\u0645 \u200E%1 \u0628\u0627\u06CC\u062F \u062F\u0648 \u0639\u062F\u062F \u0635\u062D\u06CC\u062D \u062C\u062F\u0627 \u0634\u062F\u0647 \u0628\u0627 \u06CC\u06A9 \u06A9\u0627\u0645\u0627 \u0628\u0627\u0634\u062F",
          NewextarrowArg3: "\u0646\u0634\u0627\u0646\u0648\u0646\u062F \u0633\u0648\u0645 \u200E%1 \u0628\u0627\u06CC\u062F \u0639\u062F\u062F \u06CC\u06A9 \u0646\u0648\u06CC\u0633\u0647\u0654 \u06CC\u0648\u0646\u06CC\u06A9\u062F \u0628\u0627\u0634\u062F",
          NoClosingChar: "%1 \u0628\u0633\u062A\u0647 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F",
          IllegalControlSequenceName: "\u0646\u0627\u0645 \u062F\u0646\u0628\u0627\u0644\u0647\u0654 \u06A9\u0646\u062A\u0631\u0644\u06CC \u0628\u0631\u0627\u06CC \u200E%1 \u0646\u0627\u0645\u062C\u0627\u0632",
          IllegalParamNumber: "\u0639\u062F\u062F \u0646\u0627\u0645\u062C\u0627\u0632 \u067E\u0627\u0631\u0627\u0645\u062A\u0631 \u062F\u0631 \u200E%1 \u0645\u0634\u062E\u0635 \u0634\u062F\u0647\u200C\u0627\u0633\u062A",
          MissingCS: "\u200E%1 \u0628\u0627\u06CC\u062F \u0628\u0647 \u062F\u0646\u0628\u0627\u0644 \u06CC\u06A9 \u062F\u0646\u0628\u0627\u0644\u0647\u0654 \u06A9\u0646\u062A\u0631\u0644\u06CC \u0628\u06CC\u0627\u06CC\u062F",
          CantUseHash2: "\u0627\u0633\u062A\u0641\u0627\u062F\u0647\u0654 \u0646\u0627\u0645\u062C\u0627\u0632 \u0627\u0632 # \u062F\u0631 \u0627\u0644\u06AF\u0648 \u0628\u0631\u0627\u06CC %1",
          SequentialParam: "\u067E\u0627\u0631\u0627\u0645\u062A\u0631\u0647\u0627 \u0628\u0631\u0627\u06CC %1 \u0628\u0627\u06CC\u062F \u06CC\u06A9 \u062F\u0646\u0628\u0627\u0644\u0647\u0654 \u0639\u062F\u062F\u06CC \u0628\u0627\u0634\u062F",
          MissingReplacementString: "\u0631\u0634\u062A\u0647\u0654 \u062C\u0627\u06CC\u06AF\u0632\u06CC\u0646 \u06AF\u0645\u200C\u0634\u062F\u0647 \u0628\u0631\u0627\u06CC \u062A\u0639\u0631\u06CC\u0641 \u200E%1",
          MismatchUseDef: "\u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0627\u0632 \u200E%1 \u0628\u0627 \u062A\u0639\u0631\u06CC\u0641 \u0622\u0646 \u062A\u0637\u0628\u06CC\u0642 \u0646\u062F\u0627\u0631\u062F",
          RunawayArgument: "\u0622\u0631\u06AF\u0648\u0645\u0627\u0646 \u0641\u0631\u0627\u0631 \u0628\u0631\u0627\u06CC \u200E%1\u061F",
          NoClosingDelim: "\u062C\u062F\u0627\u06A9\u0646\u0646\u062F\u0647\u0654 \u0628\u0633\u062A\u0646 \u0628\u0631\u0627\u06CC \u200E%1 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F"
        }
});

MathJax.Ajax.loadComplete("[MathJax]/localization/fa/TeX.js");
