%lex

%%

/* =========================
   COMENTARIOS
========================= */
\/\/[^\n]*                                           { addToken('COMMENT', yytext, yylloc); return 'COMMENT'; }
\/\*([^*]|\*(?!\/))*\*\/                             { addToken('COMMENT', yytext, yylloc); return 'COMMENT'; }
\/\*([^*]|\*(?!\/))*                                 { addLexError(yytext, yylloc, "Comentario de bloque sin cerrar: falta '*/'"); addToken('ERROR', yytext, yylloc); return 'ERROR'; }

/* =========================
   ESPACIOS / SALTOS
   (se conservan para render fiel de formato)
========================= */
\n                                                    { addToken('NEWLINE', yytext, yylloc); return 'NEWLINE'; }
[ \t\r\u00A0\u200B\u200C\u200D\uFEFF]+                { addToken('WHITESPACE', yytext, yylloc); return 'WHITESPACE'; }

/* =========================
   STRINGS (tolerantes para highlighting)
========================= */
/* Strings válidos: primero */
\"([^"\\\n]|\\.)*\"                                   { addToken('STRING', yytext, yylloc); return 'STRING'; }
\'([^'\\\n]|\\.)*\'                                   { addToken('STRING', yytext, yylloc); return 'STRING'; }
\x60([^\x60\\]|\\.)*\x60                              { addToken('STRING', yytext, yylloc); return 'STRING'; }

/* Comillas sueltas toleradas */
\"                                                    { addToken('STRING', yytext, yylloc); return 'STRING'; }
\'                                                    { addToken('STRING', yytext, yylloc); return 'STRING'; }

/* Strings sin cerrar: al final del bloque STRING */
\"[^"\n]*                                             { addLexError(yytext, yylloc, "String de comilla doble sin cerrar"); addToken('ERROR', yytext, yylloc); return 'ERROR'; }
\'[^'\n]*                                             { addLexError(yytext, yylloc, "String de comilla simple sin cerrar"); addToken('ERROR', yytext, yylloc); return 'ERROR'; }
\x60[^\x60\n]*                                         { addLexError(yytext, yylloc, "Template literal (backtick) sin cerrar"); addToken('ERROR', yytext, yylloc); return 'ERROR'; }

/* =========================
   KEYWORDS (.styles, .comp, .y)
========================= */
/* .styles */
"@for"                                                { addToken('KEYWORD', yytext, yylloc); return 'KEYWORD'; }
"extends"                                             { addToken('KEYWORD', yytext, yylloc); return 'KEYWORD'; }
"from"                                                { addToken('KEYWORD', yytext, yylloc); return 'KEYWORD'; }
"through"                                             { addToken('KEYWORD', yytext, yylloc); return 'KEYWORD'; }

/* .comp */
"component"                                           { addToken('KEYWORD', yytext, yylloc); return 'KEYWORD'; }
"if"                                                  { addToken('KEYWORD', yytext, yylloc); return 'KEYWORD'; }
"else"                                                { addToken('KEYWORD', yytext, yylloc); return 'KEYWORD'; }
"for"                                                 { addToken('KEYWORD', yytext, yylloc); return 'KEYWORD'; }
"while"                                               { addToken('KEYWORD', yytext, yylloc); return 'KEYWORD'; }
"switch"                                              { addToken('KEYWORD', yytext, yylloc); return 'KEYWORD'; }
"case"                                                { addToken('KEYWORD', yytext, yylloc); return 'KEYWORD'; }
"return"                                              { addToken('KEYWORD', yytext, yylloc); return 'KEYWORD'; }

/* .comp - keywords de componente */
"FORM"                                              { addToken('KEYWORD', yytext, yylloc); return 'KEYWORD'; }
"SUBMIT"                                            { addToken('KEYWORD', yytext, yylloc); return 'KEYWORD'; }
"INPUT_TEXT"                                        { addToken('KEYWORD', yytext, yylloc); return 'KEYWORD'; }
"INPUT_NUMBER"                                      { addToken('KEYWORD', yytext, yylloc); return 'KEYWORD'; }
"INPUT_BOOL"                                        { addToken('KEYWORD', yytext, yylloc); return 'KEYWORD'; }

/* Reemplazo seguro para constructores T( e IMG( sin colisión con IDENTIFIER */
T/[ \t]*\(                                          { addToken('KEYWORD', yytext, yylloc); return 'KEYWORD'; }
IMG/[ \t]*\(                                        { addToken('KEYWORD', yytext, yylloc); return 'KEYWORD'; }

/* .y */
"import"                                              { addToken('KEYWORD', yytext, yylloc); return 'KEYWORD'; }
"function"                                            { addToken('KEYWORD', yytext, yylloc); return 'KEYWORD'; }
"main"                                                { addToken('KEYWORD', yytext, yylloc); return 'KEYWORD'; }
"let"                                                 { addToken('KEYWORD', yytext, yylloc); return 'KEYWORD'; }
"const"                                               { addToken('KEYWORD', yytext, yylloc); return 'KEYWORD'; }
"var"                                                 { addToken('KEYWORD', yytext, yylloc); return 'KEYWORD'; }

/* =========================
   PROPERTY (.styles) - compuestas primero
========================= */
"background"[ \t]+"color"                             { addToken('PROPERTY', yytext, yylloc); return 'PROPERTY'; }
"text"[ \t]+"align"                                   { addToken('PROPERTY', yytext, yylloc); return 'PROPERTY'; }
"text"[ \t]+"size"                                    { addToken('PROPERTY', yytext, yylloc); return 'PROPERTY'; }
"text"[ \t]+"font"                                    { addToken('PROPERTY', yytext, yylloc); return 'PROPERTY'; }
"border"[ \t]+"style"                                 { addToken('PROPERTY', yytext, yylloc); return 'PROPERTY'; }
"border"[ \t]+"color"                                 { addToken('PROPERTY', yytext, yylloc); return 'PROPERTY'; }
"border"[ \t]+"width"                                 { addToken('PROPERTY', yytext, yylloc); return 'PROPERTY'; }
"border"[ \t]+"radius"                                { addToken('PROPERTY', yytext, yylloc); return 'PROPERTY'; }

"min-width"                                           { addToken('PROPERTY', yytext, yylloc); return 'PROPERTY'; }
"max-width"                                           { addToken('PROPERTY', yytext, yylloc); return 'PROPERTY'; }
"min-height"                                          { addToken('PROPERTY', yytext, yylloc); return 'PROPERTY'; }
"max-height"                                          { addToken('PROPERTY', yytext, yylloc); return 'PROPERTY'; }
"height"                                              { addToken('PROPERTY', yytext, yylloc); return 'PROPERTY'; }
"width"                                               { addToken('PROPERTY', yytext, yylloc); return 'PROPERTY'; }
"color"                                               { addToken('PROPERTY', yytext, yylloc); return 'PROPERTY'; }
"padding"                                             { addToken('PROPERTY', yytext, yylloc); return 'PROPERTY'; }
"margin"                                              { addToken('PROPERTY', yytext, yylloc); return 'PROPERTY'; }
"border"                                              { addToken('PROPERTY', yytext, yylloc); return 'PROPERTY'; }

/* =========================
   LITERALES (celeste)
========================= */
"true"                                                { addToken('BOOLEAN', yytext, yylloc); return 'BOOLEAN'; }
"false"                                               { addToken('BOOLEAN', yytext, yylloc); return 'BOOLEAN'; }
"null"                                                { addToken('NULL_LITERAL', yytext, yylloc); return 'NULL_LITERAL'; }

"red"|"blue"|"lightgray"                              { addToken('COLOR_LITERAL', yytext, yylloc); return 'COLOR_LITERAL'; }

/* Variables tipo $i, $index, @id */
\$[a-zA-Z_][a-zA-Z0-9_]*                              { addToken('FOR_VARIABLE', yytext, yylloc); return 'FOR_VARIABLE'; }
\@[a-zA-Z_][a-zA-Z0-9_]*                              { addToken('FOR_VARIABLE', yytext, yylloc); return 'FOR_VARIABLE'; }

/* =========================
   NÚMEROS MAL FORMADOS (ERROR) - antes de válidos
========================= */
[0-9]+\.[0-9]+\.[0-9.]*                               { addLexError(yytext, yylloc, "Número decimal mal formado"); addToken('ERROR', yytext, yylloc); return 'ERROR'; }
0[xX][0-9a-fA-F]*[g-zG-Z_][a-zA-Z0-9_]*              { addLexError(yytext, yylloc, "Hexadecimal mal formado"); addToken('ERROR', yytext, yylloc); return 'ERROR'; }
0[xX](?=[^0-9a-fA-F]|$)                               { addLexError(yytext, yylloc, "Hexadecimal incompleto: faltan dígitos"); addToken('ERROR', yytext, yylloc); return 'ERROR'; }
[0-9]+(\.[0-9]+)?[eE][+-]?(?=[^0-9]|$)                { addLexError(yytext, yylloc, "Notación científica mal formada"); addToken('ERROR', yytext, yylloc); return 'ERROR'; }

/* =========================
   COLORES HEXADECIMALES
   #RRGGBB, #RGB, #RRGGBBAA
========================= */
#[0-9a-fA-F]{8}(?![0-9a-zA-Z_])                         { addToken('HEX_COLOR', yytext, yylloc); return 'HEX_COLOR'; }
#[0-9a-fA-F]{6}(?![0-9a-zA-Z_])                         { addToken('HEX_COLOR', yytext, yylloc); return 'HEX_COLOR'; }
#[0-9a-fA-F]{3}(?![0-9a-zA-Z_])                         { addToken('HEX_COLOR', yytext, yylloc); return 'HEX_COLOR'; }

/* =========================
   NÚMEROS VÁLIDOS
========================= */
0[xX][0-9a-fA-F]+                                     { addToken('NUMBER', yytext, yylloc); return 'NUMBER'; }
[0-9]+\.[0-9]+([eE][+-]?[0-9]+)?%?                    { addToken('NUMBER', yytext, yylloc); return 'NUMBER'; }
[0-9]+([eE][+-]?[0-9]+)?%?                            { addToken('NUMBER', yytext, yylloc); return 'NUMBER'; }

/* =========================
   IDENTIFICADORES (usuario)
   Evita a---b y guión final
========================= */
[a-zA-Z_][a-zA-Z0-9_$]*(\-[a-zA-Z0-9_$]+)*            { addToken('IDENTIFIER', yytext, yylloc); return 'IDENTIFIER'; }

/* =========================
   OPERADORES (verde)
========================= */
/* multi-char primero (longest-match) */
"==="|"!=="|"++"|"--"|"+="|"-="|"*="|"/="|"%="|"??"|"?."|"=>"|"=="|"!="|"<="|">="|"&&"|"||" { addToken('OPERATOR', yytext, yylloc); return 'OPERATOR'; }
"+"|"-"|"*"|"/"|"%"|"="|"<"|">"                     { addToken('OPERATOR', yytext, yylloc); return 'OPERATOR'; }

/* Operadores incompletos */
"&"                                                   { addLexError(yytext, yylloc, "Operador '&' inválido: use '&&'"); addToken('ERROR', yytext, yylloc); return 'ERROR'; }
"|"                                                   { addLexError(yytext, yylloc, "Operador '|' inválido: use '||'"); addToken('ERROR', yytext, yylloc); return 'ERROR'; }

/* =========================
   SÍMBOLOS (azul)
========================= */
"{"|"}"|"("|")"|"["|"]"|";"|":"|","|"."|"@"|"#"       { addToken('SYMBOL', yytext, yylloc); return 'SYMBOL'; }

/* EOF */
<<EOF>>                                               { return 'EOF'; }

/* Catch-all de error */
.                                                     { addLexError(yytext, yylloc, "Símbolo '" + yytext + "' no pertenece al lenguaje"); addToken('ERROR', yytext, yylloc); return 'ERROR'; }

/lex

%start program

%%

program
  : token_list EOF
  | EOF
  ;

token_list
  : token
  | token_list token
  ;

token
  : KEYWORD
  | PROPERTY
  | IDENTIFIER
  | STRING
  | NUMBER
  | BOOLEAN
  | NULL_LITERAL
  | COLOR_LITERAL
  | FOR_VARIABLE
  | OPERATOR
  | SYMBOL
  | COMMENT
  | WHITESPACE
  | NEWLINE
  | ERROR
  ;

