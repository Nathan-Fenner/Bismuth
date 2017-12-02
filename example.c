///////////////////////////////////////////////////////
// BEGIN PRELUDE ///////////////////////////////////////
////////////////////////////////////////////////////////

#include "stdlib.h"
#include "stdio.h"

struct bismuth_function {
    void* (*func)();
};

struct bismuth_int {
    int value;
};

struct bismuth_string {
    char* value;
};

struct bismuth_bool {
    int value;
};

struct bismuth_vector {
    void** items;
    size_t length;
};

struct bismuth_function* make_bismuth_function(void* func()) {
    struct bismuth_function* result = malloc(sizeof(struct bismuth_function));
    result->func = func;
    return result;
}

struct bismuth_int* _make_bismuth_int(int value) {
    struct bismuth_int* result = malloc(sizeof(struct bismuth_int));
    result->value = value;
    return result;
}
struct bismuth_string* _make_bismuth_string(char* value) {
    struct bismuth_string* result = malloc(sizeof(struct bismuth_string));
    result->value = value;
    return result;
}
struct bismuth_bool* _make_bismuth_bool(int value) {
    struct bismuth_bool* result = malloc(sizeof(struct bismuth_bool));
    result->value = value;
    return result;
}
struct bismuth_vector* _make_bismuth_nil() {
    struct bismuth_vector* result = malloc(sizeof(struct bismuth_vector));
    result->items = 0;
    result->length = 0;
    return result;
}
void* _make_bismuth_cons(void* head, void* tail) {
    struct bismuth_vector* tail_vector = tail;
    struct bismuth_vector* result = malloc(sizeof(struct bismuth_vector));
    result->length = tail_vector->length + 1;
    result->items = malloc(sizeof(void*) * result->length);
    for (size_t i = 0; i < tail_vector->length; i++) {
        result->items[i+1] = tail_vector->items[i];
    }
    result->items[0] = head;
    return result;
}
void* _make_bismuth_snoc(void* init, void* last) {
    struct bismuth_vector* init_vector = init;
    struct bismuth_vector* result = malloc(sizeof(struct bismuth_vector));
    result->length = init_vector->length + 1;
    result->items = malloc(sizeof(void*) * result->length);
    for (size_t i = 0; i < init_vector->length; i++) {
        result->items[i] = init_vector->items[i];
    }
    result->items[init_vector->length] = last;
    return result;
}

void* _make_bismuth_unit() {
    return 0;
}

void* print_declare_builtin(void* self, void* line) {
    (void)self;
    printf("%s\n", (const char*)line);
    return _make_bismuth_unit();
}
struct bismuth_function* _bv_print;

void* show_declare_builtin() {
    // not implemented
    return 0;
}

void* at_declare_builtin(void* self, void* array, void* index) {
    (void)self;
    struct bismuth_vector* vector_array = array;
    struct bismuth_int* int_index = index;
    if (int_index->value < 0 || (size_t)(int_index->value) >= vector_array->length) {
        printf("out-of-bounds index; index %d in array of length %lu\n", int_index->value, vector_array->length);
        exit(1);
        return 0;
    }
    return vector_array->items[int_index->value];
}
struct bismuth_function* _bv_at;

void* appendArray_declare_builtin(void* self, void* first, void* second) {
    (void)self;
    struct bismuth_vector* first_vector = first;
    struct bismuth_vector* second_vector = second;
    struct bismuth_vector* result = malloc(sizeof(struct bismuth_vector));
    result->length = first_vector->length + second_vector->length;
    result->items = malloc(sizeof(void*) * result->length);
    for (size_t i = 0; i < first_vector->length; i++) {
        result->items[i] = first_vector->items[i];
    }
    for (size_t i = 0; i < second_vector->length; i++) {
        result->items[i+first_vector->length] = second_vector->items[i];
    }
    return result;
}
struct bismuth_function* _bv_appendArray;

void* appendString_declare_builtin(void* self, void* first, void* second) {
    (void)self;
    const char* first_string = first;
    const char* second_string = second;
    size_t comb_len = 0;
    for (const char* c = first_string; *c; ++c) {
        comb_len++;
    }
    for (const char* c = second_string; *c; ++c) {
        comb_len++;
    }
    char* str = malloc(comb_len + 1);
    char* o = str;
    for (const char* c = first_string; *c; ++c) {
        *o++ = *c;
    }
    for (const char* c = second_string; *c; ++c) {
        *o++ = *c;
    }
    *o = 0;
    return str;
}
struct bismuth_function* _bv_appendString;

void* length_declare_builtin(void* self, void* array) {
    (void)self;
    struct bismuth_vector* array_vector = array;
    return _make_bismuth_int((int)(array_vector->length));
}
struct bismuth_function* _bv_length;

void* less_declare_builtin(void* self, void* x, void* y) {
    (void)self;
    struct bismuth_int* x_int = x;
    struct bismuth_int* y_int = y;
    return _make_bismuth_bool(x_int->value < y_int->value);
}
struct bismuth_function* _bv_less;

void* add_declare_builtin(void* self, void* x, void* y) {
    (void)self;
    struct bismuth_int* x_int = x;
    struct bismuth_int* y_int = y;
    return _make_bismuth_int(x_int->value + y_int->value);
}
struct bismuth_function* _bv_add;

////////////////////////////////////////////////////////
// BEGIN PROGRAM ///////////////////////////////////////
////////////////////////////////////////////////////////


struct Pair{
	void* x;
	void* y;
};

void* user_func_str(void* r1008_ignore_self, void* r1002_p);

struct bismuth_function* r1007_str;

void* user_func_main(void* r1010_ignore_self);

struct bismuth_function* r1009_main;

struct bismuth_function* r1003_print;

struct bismuth_function* r1011_at;

struct bismuth_function* r1012_appendArray;

struct bismuth_function* r1001_appendString;

struct bismuth_function* r1013_length;

struct bismuth_function* r1014_show;

struct bismuth_function* r1015_less;

struct bismuth_function* r1016_add;

struct iface_ToString{
	void* (*str)();
};

void* iface_ToString_method_str_extract(void* r1017_literallySelf, void* r1018_selfConstraint, void* r1019_forward_arg);

struct bismuth_function* r1004_str;

struct iface_ToString_inst_Pair_record{
	void* gives_str;
};

void* iface_ToString_inst_Pair_create();

void* iface_ToString_inst_Pair_method_str_impl(void* r1006_self_bundle, void* r1002_p);

void* user_func_str(void* r1008_ignore_self, void* r1002_p) {

	{
	
		void* r1023 = r1001_appendString;
		void* r1025 = r1002_p;
		void* r1024 = ((struct Pair*)r1025)->x;
		void* r1027 = r1002_p;
		void* r1026 = ((struct Pair*)r1027)->y;
		void* r1028 = r1001_appendString;
		void* r1022 = ((struct bismuth_function*)r1028)->func(r1023, r1024, r1026);
		return r1022;
	}
	void* r1029 = 0;
	return r1029;
}

void* user_func_main(void* r1010_ignore_self) {

	{
	
		void* r1033 = r1003_print;
		void* r1035 = r1004_str;
		
		void * r1036 = iface_ToString_inst_Pair_create();
		struct Pair* r1037 = malloc(sizeof(struct Pair));
		void* r1038 = "xyz";
		r1037->y = r1038;
		void* r1039 = "abc";
		r1037->x = r1039;
		void* r1040 = r1004_str;
		void* r1034 = ((struct bismuth_function*)r1040)->func(r1035, r1036, r1037);
		void* r1041 = r1003_print;
		void* r1032 = ((struct bismuth_function*)r1041)->func(r1033, r1034);
		(void)r1032;
	}
	void* r1042 = 0;
	return r1042;
}

void* iface_ToString_method_str_extract(void* r1017_literallySelf, void* r1018_selfConstraint, void* r1019_forward_arg) {

	{
	
		void* r1062 = r1018_selfConstraint;
		void* r1063 = r1019_forward_arg;
		void* r1064 = r1018_selfConstraint;
		void* r1061 = ((struct iface_ToString*)r1064)->str(r1062, r1063);
		return r1061;
	}
	void* r1065 = 0;
	return r1065;
}

void* iface_ToString_inst_Pair_create() {

	{
	
		struct iface_ToString_inst_Pair_record* r1068 = malloc(sizeof(struct iface_ToString_inst_Pair_record));
		void* r1069 = iface_ToString_inst_Pair_method_str_impl;
		r1068->gives_str = r1069;
		return r1068;
	}
	void* r1070 = 0;
	return r1070;
}

void* iface_ToString_inst_Pair_method_str_impl(void* r1006_self_bundle, void* r1002_p) {

	{
	
		{
		
			void* r1072 = r1001_appendString;
			void* r1074 = r1002_p;
			void* r1073 = ((struct Pair*)r1074)->x;
			void* r1076 = r1002_p;
			void* r1075 = ((struct Pair*)r1076)->y;
			void* r1077 = r1001_appendString;
			void* r1071 = ((struct bismuth_function*)r1077)->func(r1072, r1073, r1075);
			return r1071;
		}
	}
	void* r1078 = 0;
	return r1078;
}
int main() {

	struct bismuth_function* r1087 = malloc(sizeof(struct bismuth_function));
	void* r1088 = user_func_str;
	r1087->func = r1088;
	r1007_str = r1087;


	struct bismuth_function* r1100 = malloc(sizeof(struct bismuth_function));
	void* r1101 = user_func_main;
	r1100->func = r1101;
	r1009_main = r1100;


	struct bismuth_function* r1102 = malloc(sizeof(struct bismuth_function));
	void* r1103 = print_declare_builtin;
	r1102->func = r1103;
	r1003_print = r1102;


	struct bismuth_function* r1104 = malloc(sizeof(struct bismuth_function));
	void* r1105 = at_declare_builtin;
	r1104->func = r1105;
	r1011_at = r1104;


	struct bismuth_function* r1106 = malloc(sizeof(struct bismuth_function));
	void* r1107 = appendArray_declare_builtin;
	r1106->func = r1107;
	r1012_appendArray = r1106;


	struct bismuth_function* r1108 = malloc(sizeof(struct bismuth_function));
	void* r1109 = appendString_declare_builtin;
	r1108->func = r1109;
	r1001_appendString = r1108;


	struct bismuth_function* r1110 = malloc(sizeof(struct bismuth_function));
	void* r1111 = length_declare_builtin;
	r1110->func = r1111;
	r1013_length = r1110;


	struct bismuth_function* r1112 = malloc(sizeof(struct bismuth_function));
	void* r1113 = show_declare_builtin;
	r1112->func = r1113;
	r1014_show = r1112;


	struct bismuth_function* r1114 = malloc(sizeof(struct bismuth_function));
	void* r1115 = less_declare_builtin;
	r1114->func = r1115;
	r1015_less = r1114;


	struct bismuth_function* r1116 = malloc(sizeof(struct bismuth_function));
	void* r1117 = add_declare_builtin;
	r1116->func = r1117;
	r1016_add = r1116;


	struct bismuth_function* r1123 = malloc(sizeof(struct bismuth_function));
	void* r1124 = iface_ToString_method_str_extract;
	r1123->func = r1124;
	r1004_str = r1123;


	// entry point:
	r1009_main->func();
}