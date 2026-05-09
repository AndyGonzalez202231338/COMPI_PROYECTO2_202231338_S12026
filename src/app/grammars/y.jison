
%lex

%{
/* SALIDA */
var _tokens        = [];
var _lexicalErrors = [];
var _syntaxErrors  = [];
var _ast           = null;


var _scopeStack   = [];
var _declaredFns  = {};
var _importedFiles= [];
var _mainDeclared = false;

var _loopDepth   = 0;
var _switchDepth = 0;
var _fnDepth     = 0;

/*  Gestión de scopes  */
function enterScope(name) {
  _scopeStack.push({ name: name, vars: {} });
}

function exitScope() {
  if (_scopeStack.length > 0) _scopeStack.pop();
}

function lookupVar(name) {
  for (var i = _scopeStack.length - 1; i >= 0; i--) {
    if (_scopeStack[i].vars[name]) return _scopeStack[i].vars[name];
  }
  return null;
}

function lookupVarLocal(name) {
  if (_scopeStack.length === 0) return null;
  return _scopeStack[_scopeStack.length - 1].vars[name] || null;
}

function lookupFn(name) {
  return _declaredFns[name] || null;
}

function declareVar(kind, varType, name, line, col) {
  if (_scopeStack.length === 0) enterScope('global');
  var local = lookupVarLocal(name);
  if (local) {
    addSemErr(name, line, col,
      'Variable "' + name + '" ya fue declarada en este ambito (linea ' + local.line + ')');
    return;
  }
  _scopeStack[_scopeStack.length - 1].vars[name] = {
    kind: kind, varType: varType, line: line, col: col
  };
}

function checkVarUsed(name, line, col) {
  var sym = lookupVar(name);
  if (!sym && !lookupFn(name)) {
    addSemErr(name, line, col,
      'Identificador "' + name + '" usado pero no declarado');
    return null;
  }
  return sym;
}

function declareFunction(name, params, line, col) {
  if (_declaredFns[name]) {
    addSemErr(name, line, col,
      'Funcion "' + name + '" ya fue declarada (linea ' + _declaredFns[name].line + ')');
    return;
  }
  _declaredFns[name] = { params: params || [], line: line, col: col };
}

function checkFnCall(name, argCount, line, col) {
  var fn = lookupFn(name);
  if (!fn) {
    var sym = lookupVar(name);
    if (!sym) {
      addSemErr(name, line, col, 'Funcion "' + name + '" no esta declarada');
    }
    return;
  }
  if (fn.params.length !== argCount) {
    addSemErr(name, line, col,
      'Funcion "' + name + '" espera ' + fn.params.length +
      ' argumento(s) pero se pasaron ' + argCount);
  }
}

/*  Inferencia de tipos  */
function inferType(node) {
  if (!node) return 'unknown';
  switch (node.type) {
    case 'NumLit':
      return (String(node.value).indexOf('.') >= 0) ? 'float' : 'int';
    case 'StringLit':  return 'string';
    case 'BoolLit':    return 'boolean';
    case 'NullLit':    return 'null';
    case 'Identifier':
    case 'Var': {
      var sym = lookupVar(node.value);
      return sym ? (sym.varType || 'unknown') : 'unknown';
    }
    case 'Assign':
    case 'CompoundAssign': {
      var vsym = lookupVar(node.name);
      return vsym ? (vsym.varType || 'unknown') : 'unknown';
    }
    case 'IndexAccess':
      return inferType(node.object).replace('[]', '') || 'unknown';
    case 'CallExpr': {
      var fn = lookupFn(node.callee);
      return (fn && fn.returnType) ? fn.returnType : 'unknown';
    }
    case 'BinOp':
      return inferBinOpType(node.op, inferType(node.left), inferType(node.right));
    case 'UnaryOp':
      if (node.op === '!') return 'boolean';
      if (node.op === '-') {
        var t = inferType(node.operand);
        return (t === 'float') ? 'float' : 'int';
      }
      return 'unknown';
    case 'PostfixExpr':
      return inferType(node.operand);
    default:
      return 'unknown';
  }
}

function inferBinOpType(op, leftType, rightType) {
  var compOps = ['==','!=','===','!==','>','>=','<','<='];
  var logOps  = ['&&','||'];
  if (logOps.indexOf(op) >= 0)  return 'boolean';
  if (compOps.indexOf(op) >= 0) return 'boolean';
  var arithOps = ['+', '-', '*', '/', '%'];
  if (arithOps.indexOf(op) >= 0) {
    if (leftType === 'unknown' || rightType === 'unknown') return 'unknown';
    if (op === '+' && leftType === 'string' && rightType === 'string') return 'string';
    var numTypes = ['int', 'float', 'char'];
    var leftNum  = numTypes.indexOf(leftType)  >= 0;
    var rightNum = numTypes.indexOf(rightType) >= 0;
    if (leftNum && rightNum) {
      return (leftType === 'float' || rightType === 'float') ? 'float' : 'int';
    }
    return 'type_error';
  }
  return 'unknown';
}

function checkBinOpTypes(op, leftType, rightType, line, col) {
  if (leftType === 'unknown' || rightType === 'unknown') return;
  var result = inferBinOpType(op, leftType, rightType);
  if (result === 'type_error') {
    addSemErr(op, line, col,
      'Tipos incompatibles en operacion "' + op + '": "' + leftType + '" y "' + rightType + '"');
  }
}

function checkAssignTypes(varType, exprType, name, line, col) {
  if (varType === 'unknown' || exprType === 'unknown') return;
  if (varType === exprType) return;
  if (varType === 'float' && exprType === 'int') return;
  addSemErr(name, line, col,
    'No se puede asignar tipo "' + exprType + '" a variable de tipo "' + varType + '"');
}

function checkArrayIndex(indexNode, line, col) {
  var t = inferType(indexNode);
  if (t !== 'int' && t !== 'unknown') {
    addSemErr('[]', line, col,
      'El indice de un arreglo debe ser entero, se encontro "' + t + '"');
  }
}


function checkBreakContext(line, col) {
  if (_loopDepth === 0 && _switchDepth === 0) {
    addSemErr('break', line, col,
      '"break" solo puede usarse dentro de un ciclo (for/while/do-while) o switch');
  }
}

function checkContinueContext(line, col) {
  if (_loopDepth === 0) {
    addSemErr('continue', line, col,
      '"continue" solo puede usarse dentro de un ciclo (for/while/do-while)');
  }
}

function checkReturnContext(line, col) {
  if (_fnDepth === 0) {
    addSemErr('return', line, col,
      '"return" solo puede usarse dentro de una funcion');
  }
}


function checkMainUnique(line, col) {
  if (_mainDeclared) {
    addSemErr('main', line, col, 'Solo puede existir un bloque "main" por archivo');
  }
  _mainDeclared = true;
}

function checkImportDuplicate(path, line, col) {
  if (_importedFiles.indexOf(path) >= 0) {
    addSemErr(path, line, col, 'El archivo "' + path + '" ya fue importado');
  } else {
    _importedFiles.push(path);
  }
}

function checkImportExtension(path, line, col) {
  var clean = path.replace(/^["']|["']$/g, '');
  if (!/\.(comp|styles|y)$/.test(clean)) {
    addSemErr(path, line, col,
      'El import "' + path + '" debe apuntar a un archivo .comp, .styles o .y');
  }
}


function addTok(type, value, line, col) {
  _tokens.push({ type: type, value: String(value), line: line, col: col });
}
function addLexErr(lexeme, line, col, desc) {
  _lexicalErrors.push({ lexeme: lexeme, line: line, col: col,
                        type: 'Lexico', description: desc });
}
function addSynErr(lexeme, line, col, desc) {
  _syntaxErrors.push({ lexeme: lexeme, line: line, col: col,
                       type: 'Sintactico', description: desc });
}
function addSemErr(lexeme, line, col, desc) {
  _syntaxErrors.push({ lexeme: lexeme, line: line, col: col,
                       type: 'Semantico', description: desc });
}

/* ── Reset ── */
function _reset() {
  _tokens        = [];
  _lexicalErrors = [];
  _syntaxErrors  = [];
  _ast           = null;
  _scopeStack    = [];
  _declaredFns   = {};
  _importedFiles = [];
  _mainDeclared  = false;
  _loopDepth     = 0;
  _switchDepth   = 0;
  _fnDepth       = 0;
}

function _results() {
  return {
    ast:           _ast,
    tokens:        _tokens,
    lexicalErrors: _lexicalErrors,
    syntaxErrors:  _syntaxErrors
  };
}
%}

/*  Macros */
ID      [a-zA-Z_][a-zA-Z0-9_]*
DIGIT   [0-9]
HEX     0[xX][0-9a-fA-F]+
FLOAT   {DIGIT}+\.{DIGIT}+
INT     {DIGIT}+
WS      [ \t\r]+

%%

/*  COMENTARIOS (gris) */
"/*"([^*]|("*"[^/]))*"*/"
    { addTok('COMMENT', yytext, yylineno+1, yylloc.first_column+1); }

"//"[^\n]*
    { addTok('COMMENT', yytext, yylineno+1, yylloc.first_column+1); }

/*  KEYWORDS (morado) — más largos primero  */
"import"    { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_IMPORT';   }
"function"  { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_FUNCTION'; }
"return"    { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_RETURN';   }
"while"     { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_WHILE';    }
"const"     { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_CONST';    }
"else"      { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_ELSE';     }
"main"      { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_MAIN';     }
"load"      { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_LOAD';     }
"execute"   { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_EXECUTE';  }
"break"     { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_BREAK';    }
"continue"  { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_CONTINUE'; }
"switch"    { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_SWITCH';   }
"case"      { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_CASE';     }
"default"   { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_DEFAULT';  }
"do"        { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_DO';       }
"var"       { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_VAR';      }
"let"       { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_LET';      }
"for"       { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_FOR';      }
"if"        { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_IF';       }
"int"       { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_INT';      }
"float"     { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_FLOAT_T';  }
"string"    { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_STRING_T'; }
"boolean"   { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_BOOLEAN_T';}
"char"      { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_CHAR_T';   }

/*  BOOLEANOS / NULL (celeste)  */
"true"   { addTok('BOOLEAN',yytext,yylineno+1,yylloc.first_column+1); return 'BOOL_LIT'; }
"True"   { addTok('BOOLEAN',yytext,yylineno+1,yylloc.first_column+1); return 'BOOL_LIT'; }
"false"  { addTok('BOOLEAN',yytext,yylineno+1,yylloc.first_column+1); return 'BOOL_LIT'; }
"False"  { addTok('BOOLEAN',yytext,yylineno+1,yylloc.first_column+1); return 'BOOL_LIT'; }
"null"   { addTok('NULL',   yytext,yylineno+1,yylloc.first_column+1); return 'NULL_LIT'; }

/*  NÚMEROS (celeste)  */
{HEX}    { addTok('NUMBER',yytext,yylineno+1,yylloc.first_column+1); return 'NUM'; }
{FLOAT}  { addTok('NUMBER',yytext,yylineno+1,yylloc.first_column+1); return 'NUM'; }
{INT}    { addTok('NUMBER',yytext,yylineno+1,yylloc.first_column+1); return 'NUM'; }

/*  STRINGS (amarillo) */
\"([^\"\\]|\\.)*\"
    { addTok('STRING',yytext,yylineno+1,yylloc.first_column+1); return 'STR'; }
\'([^\'\\]|\\.)*\'
    { addTok('STRING',yytext,yylineno+1,yylloc.first_column+1); return 'STR'; }

/* String sin cerrar */
\"[^\"]*$
    { addLexErr(yytext,yylineno+1,yylloc.first_column+1,'String con comilla doble sin cerrar'); }
\'[^\']*$
    { addLexErr(yytext,yylineno+1,yylloc.first_column+1,'String con comilla simple sin cerrar'); }

/* BACKTICK para execute */
"`"[^`]*"`"
    { addTok('BACKTICK_STR',yytext,yylineno+1,yylloc.first_column+1); return 'BACKTICK_STR'; }

/* ── OPERADORES (verde) — más largos primero ── */
"===" { addTok('OPERATOR','===',yylineno+1,yylloc.first_column+1); return 'OP_STRICT_EQ';  }
"!==" { addTok('OPERATOR','!==',yylineno+1,yylloc.first_column+1); return 'OP_STRICT_NEQ'; }
"=="  { addTok('OPERATOR','==', yylineno+1,yylloc.first_column+1); return 'OP_EQ';         }
"!="  { addTok('OPERATOR','!=', yylineno+1,yylloc.first_column+1); return 'OP_NEQ';        }
">="  { addTok('OPERATOR','>=', yylineno+1,yylloc.first_column+1); return 'OP_GTE';        }
"<="  { addTok('OPERATOR','<=', yylineno+1,yylloc.first_column+1); return 'OP_LTE';        }
"++"  { addTok('OPERATOR','++', yylineno+1,yylloc.first_column+1); return 'OP_INC';        }
"--"  { addTok('OPERATOR','--', yylineno+1,yylloc.first_column+1); return 'OP_DEC';        }
"+="  { addTok('OPERATOR','+=', yylineno+1,yylloc.first_column+1); return 'OP_PLUS_EQ';   }
"-="  { addTok('OPERATOR','-=', yylineno+1,yylloc.first_column+1); return 'OP_MINUS_EQ';  }
"&&"  { addTok('OPERATOR','&&', yylineno+1,yylloc.first_column+1); return 'OP_AND';        }
"||"  { addTok('OPERATOR','||', yylineno+1,yylloc.first_column+1); return 'OP_OR';         }
">"   { addTok('OPERATOR','>', yylineno+1,yylloc.first_column+1);  return 'OP_GT';         }
"<"   { addTok('OPERATOR','<', yylineno+1,yylloc.first_column+1);  return 'OP_LT';         }
"+"   { addTok('OPERATOR','+', yylineno+1,yylloc.first_column+1);  return 'OP_PLUS';       }
"-"   { addTok('OPERATOR','-', yylineno+1,yylloc.first_column+1);  return 'OP_MINUS';      }
"*"   { addTok('OPERATOR','*', yylineno+1,yylloc.first_column+1);  return 'OP_MUL';        }
"/"   { addTok('OPERATOR','/', yylineno+1,yylloc.first_column+1);  return 'OP_DIV';        }
"%"   { addTok('OPERATOR','%', yylineno+1,yylloc.first_column+1);  return 'OP_MOD';        }
"!"   { addTok('OPERATOR','!', yylineno+1,yylloc.first_column+1);  return 'OP_NOT';        }
"="   { addTok('OPERATOR','=', yylineno+1,yylloc.first_column+1);  return 'OP_ASSIGN';     }

/* ── SÍMBOLOS (azul) ── */
"{"   { addTok('SYMBOL','{',yylineno+1,yylloc.first_column+1); return 'LBRACE';  }
"}"   { addTok('SYMBOL','}',yylineno+1,yylloc.first_column+1); return 'RBRACE';  }
"("   { addTok('SYMBOL','(',yylineno+1,yylloc.first_column+1); return 'LPAREN';  }
")"   { addTok('SYMBOL',')',yylineno+1,yylloc.first_column+1); return 'RPAREN';  }
"["   { addTok('SYMBOL','[',yylineno+1,yylloc.first_column+1); return 'LBRACK';  }
"]"   { addTok('SYMBOL',']',yylineno+1,yylloc.first_column+1); return 'RBRACK';  }
";"   { addTok('SYMBOL',';',yylineno+1,yylloc.first_column+1); return 'SEMI';    }
","   { addTok('SYMBOL',',',yylineno+1,yylloc.first_column+1); return 'COMMA';   }
"."   { addTok('SYMBOL','.',yylineno+1,yylloc.first_column+1); return 'DOT';     }
":"   { addTok('SYMBOL',':',yylineno+1,yylloc.first_column+1); return 'COLON';   }
"#"   { addTok('SYMBOL','#',yylineno+1,yylloc.first_column+1); return 'HASH';    }
"@"   { addTok('SYMBOL','@',yylineno+1,yylloc.first_column+1); return 'AT';      }

/*  IDENTIFICADORES (naranja) ─ */
{ID}  { addTok('IDENTIFIER',yytext,yylineno+1,yylloc.first_column+1); return 'ID'; }

/*  WHITESPACE  */
\n    { }
{WS}  { }

/*  ERROR LÉXICO  */
.
    { addLexErr(yytext,yylineno+1,yylloc.first_column+1,
        'Simbolo no reconocido: "' + yytext + '"'); }

/lex

/* PRECEDENCIA — de menor a mayor */
%right    OP_ASSIGN OP_PLUS_EQ OP_MINUS_EQ
%left     OP_OR
%left     OP_AND
%right    OP_NOT
%left     OP_EQ OP_NEQ OP_STRICT_EQ OP_STRICT_NEQ
%left     OP_LT OP_LTE OP_GT OP_GTE
%left     OP_PLUS OP_MINUS
%left     OP_MUL OP_DIV OP_MOD
%right    UMINUS
%left     OP_INC OP_DEC
%left     LBRACK DOT LPAREN

%start program

%%

/* PROGRAMA */
program
  : prog_start program_body
      { _ast = { type: 'Program', body: $2 }; }
  ;

/* No-terminal auxiliar: abre scope global sin ser acción intermedia */
prog_start
  : /* vacío */
      { enterScope('global'); }
  ;

program_body
  : /* vacío */                 { $$ = []; }
  | program_body program_item   { $$ = $1.concat([$2]); }
  ;

program_item
  : import_decl    { $$ = $1; }
  | function_decl  { $$ = $1; }
  | main_decl      { $$ = $1; }
  | typed_var_decl { $$ = $1; }
  ;

/* IMPORTS */
import_decl
  : KW_IMPORT STR SEMI
      {
        checkImportExtension($2, @1.first_line, @1.first_column+1);
        checkImportDuplicate($2, @1.first_line, @1.first_column+1);
        $$ = { type:'Import', path:$2, line:@1.first_line, col:@1.first_column+1 };
      }
  ;

/* 
   VARIABLES TIPADAS
   int x = 5;   |   float[] arr = [10];
    */
typed_var_decl
  : type_spec ID OP_ASSIGN expr SEMI
      {
        var exprT = inferType($4);
        checkAssignTypes($1, exprT, $2, @2.first_line, @2.first_column+1);
        declareVar('typed', $1, $2, @2.first_line, @2.first_column+1);
        $$ = { type:'VariableDeclaration', kind:$1, varType:$1, name:$2, init:$4,
               line:@2.first_line, col:@2.first_column+1 };
      }
  | type_spec LBRACK RBRACK ID OP_ASSIGN array_init SEMI
      {
        var arrT = $1 + '[]';
        declareVar('typed', arrT, $4, @4.first_line, @4.first_column+1);
        $$ = { type:'VariableDeclaration', kind:arrT, varType:arrT, name:$4, init:$6,
               line:@4.first_line, col:@4.first_column+1 };
      }
  | type_spec LBRACK RBRACK ID OP_ASSIGN KW_EXECUTE BACKTICK_STR SEMI
      {
        var arrT2 = $1 + '[]';
        declareVar('typed', arrT2, $4, @4.first_line, @4.first_column+1);
        $$ = { type:'VariableDeclaration', kind:arrT2, varType:arrT2, name:$4,
               init:{ type:'Execute', query:$7 },
               line:@4.first_line, col:@4.first_column+1 };
      }
  ;

type_spec
  : KW_INT       { $$ = 'int';     }
  | KW_FLOAT_T   { $$ = 'float';   }
  | KW_STRING_T  { $$ = 'string';  }
  | KW_BOOLEAN_T { $$ = 'boolean'; }
  | KW_CHAR_T    { $$ = 'char';    }
  ;

array_init
  : LBRACK NUM RBRACK
      { $$ = { type:'ArraySize', size:$2 }; }
  | LBRACE expr_list RBRACE
      { $$ = { type:'ArrayLiteral', elements:$2 }; }
  ;

/* VARIABLES let / const / var */
local_var_decl
  : var_kw ID OP_ASSIGN expr SEMI
      {
        var inferredT = inferType($4);
        declareVar($1, inferredT, $2, @2.first_line, @2.first_column+1);
        $$ = { type:'VariableDeclaration', kind:$1, varType:inferredT, name:$2, init:$4,
               line:@2.first_line, col:@2.first_column+1 };
      }
  | var_kw ID SEMI
      {
        declareVar($1, 'unknown', $2, @2.first_line, @2.first_column+1);
        $$ = { type:'VariableDeclaration', kind:$1, varType:'unknown', name:$2, init:null,
               line:@2.first_line, col:@2.first_column+1 };
      }
  ;

var_kw
  : KW_LET   { $$ = 'let';   }
  | KW_CONST { $$ = 'const'; }
  | KW_VAR   { $$ = 'var';   }
  ;


function_decl
  : fn_sig LBRACE stmt_list RBRACE
      {
        _fnDepth--;
        exitScope();
        $$ = { type:'FunctionDecl', name:$1.name, params:$1.params, body:$3,
               line:$1.line, col:$1.col };
      }
  ;

fn_sig
  : KW_FUNCTION ID LPAREN param_list RPAREN
      {
        /* Toda la semántica aquí — no hay acción intermedia */
        declareFunction($2, $4, @1.first_line, @1.first_column+1);
        enterScope('fn_' + $2);
        _fnDepth++;
        ($4 || []).forEach(function(p) {
          declareVar('param', p.paramType || 'unknown', p.name, @1.first_line, @1.first_column+1);
        });
        $$ = { name:$2, params:$4, line:@1.first_line, col:@1.first_column+1 };
      }
  ;

param_list
  : /* vacío */      { $$ = []; }
  | param_decl_list  { $$ = $1; }
  ;

param_decl_list
  : param_decl_list COMMA param_decl  { $$ = $1.concat([$3]); }
  | param_decl                        { $$ = [$1]; }
  ;

param_decl
  : type_spec ID  { $$ = { paramType:$1, name:$2 }; }
  | ID            { $$ = { paramType:'unknown', name:$1 }; }
  ;


main_decl
  : KW_MAIN main_open LBRACE stmt_list RBRACE
      {
        checkMainUnique(@1.first_line, @1.first_column+1);
        _fnDepth--;
        exitScope();
        $$ = { type:'Main', body:$4, line:@1.first_line, col:@1.first_column+1 };
      }
  ;

main_open
  : /* vacío */
      {
        enterScope('main');
        _fnDepth++;
      }
  ;

/* SENTENCIAS */
stmt_list
  : /* vacío */           { $$ = []; }
  | stmt_list stmt        { $$ = $1.concat([$2]); }
  ;

stmt
  : local_var_decl        { $$ = $1; }
  | typed_var_decl        { $$ = $1; }
  | expr_stmt             { $$ = $1; }
  | return_stmt           { $$ = $1; }
  | if_stmt               { $$ = $1; }
  | for_stmt              { $$ = $1; }
  | while_stmt            { $$ = $1; }
  | do_while_stmt         { $$ = $1; }
  | switch_stmt           { $$ = $1; }
  | break_stmt            { $$ = $1; }
  | continue_stmt         { $$ = $1; }
  | load_stmt             { $$ = $1; }
  | execute_stmt          { $$ = $1; }
  | component_call_stmt   { $$ = $1; }
  | block_stmt            { $$ = $1; }
  ;

expr_stmt
  : expr SEMI
      { $$ = { type:'ExprStmt', expr:$1, line:@1.first_line, col:@1.first_column+1 }; }
  ;

return_stmt
  : KW_RETURN expr SEMI
      {
        checkReturnContext(@1.first_line, @1.first_column+1);
        $$ = { type:'Return', value:$2, line:@1.first_line, col:@1.first_column+1 };
      }
  | KW_RETURN SEMI
      {
        checkReturnContext(@1.first_line, @1.first_column+1);
        $$ = { type:'Return', value:null, line:@1.first_line, col:@1.first_column+1 };
      }
  ;

break_stmt
  : KW_BREAK SEMI
      {
        checkBreakContext(@1.first_line, @1.first_column+1);
        $$ = { type:'Break', line:@1.first_line, col:@1.first_column+1 };
      }
  ;

continue_stmt
  : KW_CONTINUE SEMI
      {
        checkContinueContext(@1.first_line, @1.first_column+1);
        $$ = { type:'Continue', line:@1.first_line, col:@1.first_column+1 };
      }
  ;

load_stmt
  : KW_LOAD ID SEMI
      { $$ = { type:'Load', target:{ type:'Identifier', value:$2 },
               line:@1.first_line, col:@1.first_column+1 }; }
  | KW_LOAD STR SEMI
      { $$ = { type:'Load', target:{ type:'StringLit', value:$2 },
               line:@1.first_line, col:@1.first_column+1 }; }
  ;

execute_stmt
  : KW_EXECUTE BACKTICK_STR SEMI
      { $$ = { type:'Execute', query:$2, line:@1.first_line, col:@1.first_column+1 }; }
  ;

component_call_stmt
  : AT ID LPAREN arg_list RPAREN SEMI
      {
        $$ = { type:'ComponentCall', name:$2, args:$4,
               line:@1.first_line, col:@1.first_column+1 };
      }
  ;

/* BLOQUE ANÓNIMO */
block_stmt
  : block_open LBRACE stmt_list RBRACE
      {
        exitScope();
        $$ = { type:'Block', body:$3, line:@2.first_line, col:@2.first_column+1 };
      }
  ;

block_open
  : /* vacío */
      { enterScope('block'); }
  ;

/*IF / ELSE IF / ELSE*/
if_stmt
  : KW_IF LPAREN expr RPAREN if_body else_chain
      {
        $$ = { type:'IfStatement', condition:$3, thenBody:$5, elseChain:$6,
               line:@1.first_line, col:@1.first_column+1 };
      }
  ;

if_body
  : if_open LBRACE stmt_list RBRACE
      {
        exitScope();
        $$ = $3;
      }
  ;

if_open
  : /* vacío */
      { enterScope('if'); }
  ;

else_chain
  : /* vacío */
      { $$ = null; }
  | KW_ELSE KW_IF LPAREN expr RPAREN elseif_body else_chain
      { $$ = { type:'ElseIf', condition:$4, body:$6, next:$7 }; }
  | KW_ELSE else_body
      { $$ = { type:'Else', body:$2 }; }
  ;

elseif_body
  : elseif_open LBRACE stmt_list RBRACE
      {
        exitScope();
        $$ = $3;
      }
  ;

elseif_open
  : /* vacío */
      { enterScope('elseif'); }
  ;

else_body
  : else_open LBRACE stmt_list RBRACE
      {
        exitScope();
        $$ = $3;
      }
  ;

else_open
  : /* vacío */
      { enterScope('else'); }
  ;

/* FOR*/
for_stmt
  : KW_FOR LPAREN for_scope_open for_init SEMI expr SEMI for_update RPAREN for_body
      {
        $$ = { type:'ForStatement', init:$4, test:$6, update:$8, body:$10,
               line:@1.first_line, col:@1.first_column+1 };
      }
  ;

for_scope_open
  : /* vacío */
      { enterScope('for'); }
  ;

for_body
  : for_body_open LBRACE stmt_list RBRACE
      {
        _loopDepth--;
        exitScope();
        $$ = $3;
      }
  ;

for_body_open
  : /* vacío */
      { _loopDepth++; }
  ;

for_init
  : var_kw ID OP_ASSIGN expr
      {
        var inferredT = inferType($4);
        declareVar($1, inferredT, $2, @2.first_line, @2.first_column+1);
        $$ = { type:'VariableDeclaration', kind:$1, varType:inferredT, name:$2, init:$4 };
      }
  | ID OP_ASSIGN expr
      {
        var sym = checkVarUsed($1, @1.first_line, @1.first_column+1);
        var exprT = inferType($3);
        if (sym) checkAssignTypes(sym.varType, exprT, $1, @1.first_line, @1.first_column+1);
        $$ = { type:'Assign', name:$1, value:$3 };
      }
  | /* vacío */  { $$ = null; }
  ;

for_update
  : ID OP_ASSIGN expr
      {
        checkVarUsed($1, @1.first_line, @1.first_column+1);
        $$ = { type:'Assign', name:$1, value:$3 };
      }
  | ID OP_INC
      {
        checkVarUsed($1, @1.first_line, @1.first_column+1);
        $$ = { type:'PostfixExpr', op:'++', operand:$1 };
      }
  | ID OP_DEC
      {
        checkVarUsed($1, @1.first_line, @1.first_column+1);
        $$ = { type:'PostfixExpr', op:'--', operand:$1 };
      }
  | /* vacío */  { $$ = null; }
  ;

/* 
   WHILE
   Acción intermedia movida a 'while_body'.
   body = $3 en while_body.

   Estructura:
     KW_WHILE LPAREN expr RPAREN while_body
     $1       $2     $3   $4      $5
    */
while_stmt
  : KW_WHILE LPAREN expr RPAREN while_body
      {
        $$ = { type:'WhileStatement', condition:$3, body:$5,
               line:@1.first_line, col:@1.first_column+1 };
      }
  ;

while_body
  : while_open LBRACE stmt_list RBRACE
      {
        _loopDepth--;
        exitScope();
        $$ = $3;
      }
  ;

while_open
  : /* vacío */
      { enterScope('while'); _loopDepth++; }
  ;

/* 
   DO-WHILE
    */
do_while_stmt
  : KW_DO do_open LBRACE stmt_list RBRACE KW_WHILE LPAREN expr RPAREN SEMI
      {
        _loopDepth--;
        exitScope();
        $$ = { type:'DoWhileStatement', body:$4, condition:$8,
               line:@1.first_line, col:@1.first_column+1 };
      }
  ;

do_open
  : /* vacío */
      { enterScope('do'); _loopDepth++; }
  ;

/* SWITCH*/
switch_stmt
  : KW_SWITCH LPAREN expr RPAREN LBRACE switch_open switch_case_list opt_default RBRACE
      {
        _switchDepth--;
        $$ = { type:'SwitchStatement', expr:$3, cases:$7, default:$8,
               line:@1.first_line, col:@1.first_column+1 };
      }
  ;

switch_open
  : /* vacío */
      { _switchDepth++; }
  ;

switch_case_list
  : /* vacío */                        { $$ = []; }
  | switch_case_list switch_case_item  { $$ = $1.concat([$2]); }
  ;

/* CASE */
switch_case_item
  : KW_CASE expr COLON case_body
      { $$ = { type:'SwitchCase', test:$2, body:$4 }; }
  ;

case_body
  : case_open stmt_list case_close
      { $$ = $2; }
  ;

case_open
  : /* vacío */
      { enterScope('case'); }
  ;

case_close
  : /* vacío */
      { exitScope(); }
  ;

/* DEFAULT */
opt_default
  : /* vacío */
      { $$ = null; }
  | KW_DEFAULT COLON default_body
      { $$ = { type:'SwitchDefault', body:$3 }; }
  ;

default_body
  : default_open stmt_list default_close
      { $$ = $2; }
  ;

default_open
  : /* vacío */
      { enterScope('default'); }
  ;

default_close
  : /* vacío */
      { exitScope(); }
  ;

/* ================================================================
   EXPRESIONES
   ================================================================ */
expr
  /* ── Asignación ── */
  : ID OP_ASSIGN expr
      {
        var sym = checkVarUsed($1, @1.first_line, @1.first_column+1);
        var exprT = inferType($3);
        if (sym) checkAssignTypes(sym.varType, exprT, $1, @1.first_line, @1.first_column+1);
        $$ = { type:'Assign', name:$1, value:$3, inferredType:exprT,
               line:@1.first_line, col:@1.first_column+1 };
      }

  /* ── Asignación a arreglo ── */
  | ID LBRACK expr RBRACK OP_ASSIGN expr
      {
        var sym = checkVarUsed($1, @1.first_line, @1.first_column+1);
        checkArrayIndex($3, @3.first_line, @3.first_column+1);
        if (sym && sym.varType) {
          var elemT = sym.varType.replace('[]','');
          checkAssignTypes(elemT, inferType($6), $1, @6.first_line, @6.first_column+1);
        }
        $$ = { type:'IndexAssign', name:$1, index:$3, value:$6 };
      }

  /* ── Asignación compuesta ── */
  | ID OP_PLUS_EQ expr
      {
        checkVarUsed($1, @1.first_line, @1.first_column+1);
        $$ = { type:'CompoundAssign', op:'+=', name:$1, value:$3 };
      }
  | ID OP_MINUS_EQ expr
      {
        checkVarUsed($1, @1.first_line, @1.first_column+1);
        $$ = { type:'CompoundAssign', op:'-=', name:$1, value:$3 };
      }

  /* ── Binarios lógicos ── */
  | expr OP_OR  expr
      {
        checkBinOpTypes('||', inferType($1), inferType($3), @2.first_line, @2.first_column+1);
        $$ = { type:'BinOp', op:'||', left:$1, right:$3, inferredType:'boolean' };
      }
  | expr OP_AND expr
      {
        checkBinOpTypes('&&', inferType($1), inferType($3), @2.first_line, @2.first_column+1);
        $$ = { type:'BinOp', op:'&&', left:$1, right:$3, inferredType:'boolean' };
      }

  /* ── Comparación ── */
  | expr OP_EQ         expr { $$ = { type:'BinOp', op:'==',  left:$1, right:$3, inferredType:'boolean' }; }
  | expr OP_NEQ        expr { $$ = { type:'BinOp', op:'!=',  left:$1, right:$3, inferredType:'boolean' }; }
  | expr OP_STRICT_EQ  expr { $$ = { type:'BinOp', op:'===', left:$1, right:$3, inferredType:'boolean' }; }
  | expr OP_STRICT_NEQ expr { $$ = { type:'BinOp', op:'!==', left:$1, right:$3, inferredType:'boolean' }; }
  | expr OP_GT         expr { $$ = { type:'BinOp', op:'>',   left:$1, right:$3, inferredType:'boolean' }; }
  | expr OP_GTE        expr { $$ = { type:'BinOp', op:'>=',  left:$1, right:$3, inferredType:'boolean' }; }
  | expr OP_LT         expr { $$ = { type:'BinOp', op:'<',   left:$1, right:$3, inferredType:'boolean' }; }
  | expr OP_LTE        expr { $$ = { type:'BinOp', op:'<=',  left:$1, right:$3, inferredType:'boolean' }; }

  /* ── Aritmética ── */
  | expr OP_PLUS  expr
      {
        var lt = inferType($1); var rt = inferType($3);
        checkBinOpTypes('+', lt, rt, @2.first_line, @2.first_column+1);
        $$ = { type:'BinOp', op:'+', left:$1, right:$3, inferredType:inferBinOpType('+',lt,rt) };
      }
  | expr OP_MINUS expr
      {
        var lt = inferType($1); var rt = inferType($3);
        checkBinOpTypes('-', lt, rt, @2.first_line, @2.first_column+1);
        $$ = { type:'BinOp', op:'-', left:$1, right:$3, inferredType:inferBinOpType('-',lt,rt) };
      }
  | expr OP_MUL   expr
      {
        var lt = inferType($1); var rt = inferType($3);
        checkBinOpTypes('*', lt, rt, @2.first_line, @2.first_column+1);
        $$ = { type:'BinOp', op:'*', left:$1, right:$3, inferredType:inferBinOpType('*',lt,rt) };
      }
  | expr OP_DIV   expr
      {
        var lt = inferType($1); var rt = inferType($3);
        checkBinOpTypes('/', lt, rt, @2.first_line, @2.first_column+1);
        $$ = { type:'BinOp', op:'/', left:$1, right:$3, inferredType:inferBinOpType('/',lt,rt) };
      }
  | expr OP_MOD   expr
      {
        var lt = inferType($1); var rt = inferType($3);
        checkBinOpTypes('%', lt, rt, @2.first_line, @2.first_column+1);
        $$ = { type:'BinOp', op:'%', left:$1, right:$3, inferredType:inferBinOpType('%',lt,rt) };
      }

  /* ── Unarios ── */
  | OP_MINUS expr %prec UMINUS
      { $$ = { type:'UnaryOp', op:'-', operand:$2, inferredType:inferType($2) }; }
  | OP_NOT expr
      { $$ = { type:'UnaryOp', op:'!', operand:$2, inferredType:'boolean' }; }

  /* ── Postfijos ── */
  | expr OP_INC
      { $$ = { type:'PostfixExpr', op:'++', operand:$1, inferredType:inferType($1) }; }
  | expr OP_DEC
      { $$ = { type:'PostfixExpr', op:'--', operand:$1, inferredType:inferType($1) }; }

  /* ── Indexación ── */
  | expr LBRACK expr RBRACK
      {
        checkArrayIndex($3, @3.first_line, @3.first_column+1);
        var baseT = inferType($1).replace('[]','');
        $$ = { type:'IndexAccess', object:$1, index:$3, inferredType:baseT };
      }

  /* ── Acceso a miembro ── */
  | expr DOT ID
      { $$ = { type:'MemberAccess', object:$1, property:$3, inferredType:'unknown' }; }

  /* ── Llamada a función ── */
  | ID LPAREN arg_list RPAREN
      {
        checkFnCall($1, $3.length, @1.first_line, @1.first_column+1);
        var fn = lookupFn($1);
        $$ = { type:'CallExpr', callee:$1, args:$3,
               inferredType:(fn && fn.returnType) ? fn.returnType : 'unknown',
               line:@1.first_line, col:@1.first_column+1 };
      }

  /* ── Agrupación ── */
  | LPAREN expr RPAREN  { $$ = $2; }

  /* ── Execute en expresión ── */
  | KW_EXECUTE BACKTICK_STR
      { $$ = { type:'Execute', query:$2, inferredType:'unknown' }; }

  /* ── Átomos ── */
  | ID
      {
        checkVarUsed($1, @1.first_line, @1.first_column+1);
        var sym = lookupVar($1);
        $$ = { type:'Identifier', value:$1,
               inferredType:sym ? (sym.varType || 'unknown') : 'unknown',
               line:@1.first_line, col:@1.first_column+1 };
      }
  | NUM
      {
        var isFloat = String($1).indexOf('.') >= 0;
        $$ = { type:'NumLit', value:$1, inferredType:isFloat ? 'float' : 'int' };
      }
  | STR
      { $$ = { type:'StringLit', value:$1, inferredType:'string' }; }
  | BOOL_LIT
      { $$ = { type:'BoolLit', value:$1, inferredType:'boolean' }; }
  | NULL_LIT
      { $$ = { type:'NullLit', inferredType:'null' }; }
  ;

/* ================================================================
   ARGUMENTOS
   ================================================================ */
arg_list
  : /* vacío */    { $$ = []; }
  | arg_item_list  { $$ = $1; }
  ;

arg_item_list
  : arg_item_list COMMA expr  { $$ = $1.concat([$3]); }
  | expr                      { $$ = [$1]; }
  ;

/* ================================================================
   LISTAS DE EXPRESIONES (arrays)
   ================================================================ */
expr_list
  : /* vacío */    { $$ = []; }
  | expr_item_list { $$ = $1; }
  ;

expr_item_list
  : expr_item_list COMMA expr  { $$ = $1.concat([$3]); }
  | expr                       { $$ = [$1]; }
  ;

%%

/* ================================================================
   API PÚBLICA
   ================================================================ */
if (typeof module !== 'undefined' && module.exports) {

  exports.parser.yy.parseError = function(msg, hash) {
    var lex  = hash && hash.text ? hash.text                 : 'EOF';
    var line = hash && hash.loc  ? hash.loc.first_line       : 0;
    var col  = hash && hash.loc  ? hash.loc.first_column + 1 : 0;
    var desc = msg;
    if (hash && hash.expected && hash.expected.length > 0) {
      desc = 'Se encontro "' + lex + '" pero se esperaba: ' +
             hash.expected.map(function(t){ return '"' + t + '"'; }).join(', ');
    }
    addSynErr(lex, line, col, desc);
    throw new Error(desc);
  };

  exports.parse = function(input) {
    _reset();
    try {
      exports.parser.parse(input);
    } catch(e) {
      if (!_ast) _ast = null;
    }
    return _results();
  };

  exports.getResults    = _results;
  exports.lookupVar     = lookupVar;
  exports.lookupFn      = lookupFn;
  exports.getScopeStack = function() { return _scopeStack.slice(); };
}