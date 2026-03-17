# Benchmarks

All benchmarks are reproducible and implemented using **JMH (Java Microbenchmark Harness)**.

## JSON Parsing Benchmark
This benchmark measures the additional structural overhead introduced by SJF4J on top of native JSON libraries.

SJF4J performs encoding and decoding on top of the underlying JSON parsers.  
It adds structural capabilities to the OBNT model, such as `JOJO`, `NodeValue`, and `@AnyOf`,
while attempting to minimize additional overhead.

To bridge different JSON libraries, SJF4J provides three streaming integration modes:

- **SHARED_IO** — reuse the parser’s shared IO pipeline
- **EXCLUSIVE_IO** — delegate exclusive streaming control to the underlying library
- **PLUGIN_MODULE** — integrate through a dedicated module implementation

Performance characteristics vary depending on the backend and workload,
and no single mode is universally optimal.

Sample JSON (~1 KB) with nested objects and arrays. Source: [ReadBenchmark.java](https://github.com/sjf4j-projects/sjf4j/blob/main/sjf4j/src/jmh/java/org/sjf4j/ReadBenchmark.java)

```text
Benchmark                           (streamingMode)  Mode  Cnt   Score   Error  Units
Read.json_jackson_native_has_any                N/A  avgt   20   3.114 ± 0.123  us/op baseline
Read.json_jackson_facade_jojo             SHARED_IO  avgt   20   3.145 ± 0.063  us/op
Read.json_jackson_facade_jojo          EXCLUSIVE_IO  avgt   20   2.845 ± 0.038  us/op !0.91x faster
Read.json_jackson_facade_jojo         PLUGIN_MODULE  avgt   20   3.055 ± 0.050  us/op !0.98x faster

Read.json_jackson_native_pojo                   N/A  avgt   20   1.661 ± 0.033  us/op baseline
Read.json_jackson_facade_pojo             SHARED_IO  avgt   20   2.263 ± 0.043  us/op
Read.json_jackson_facade_pojo          EXCLUSIVE_IO  avgt   20   2.104 ± 0.004  us/op
Read.json_jackson_facade_pojo         PLUGIN_MODULE  avgt   20   1.627 ± 0.021  us/op !0.98x faster

-- no baseline
Read.json_gson_facade_jojo                SHARED_IO  avgt   20   3.692 ± 0.056  us/op !
Read.json_gson_facade_jojo             EXCLUSIVE_IO  avgt   20   3.699 ± 0.065  us/op !
Read.json_gson_facade_jojo            PLUGIN_MODULE  avgt   20   3.782 ± 0.031  us/op

Read.json_gson_native_pojo                      N/A  avgt   20   2.560 ± 0.038  us/op baseline
Read.json_gson_facade_pojo                SHARED_IO  avgt   20   2.644 ± 0.029  us/op
Read.json_gson_facade_pojo             EXCLUSIVE_IO  avgt   20   2.512 ± 0.018  us/op !0.98x faster
Read.json_gson_facade_pojo            PLUGIN_MODULE  avgt   20   2.553 ± 0.027  us/op

Read.json_fastjson2_native_has_any              N/A  avgt   20   2.174 ± 0.039  us/op baseline
Read.json_fastjson2_facade_jojo           SHARED_IO  avgt   20   2.481 ± 0.043  us/op
Read.json_fastjson2_facade_jojo        EXCLUSIVE_IO  avgt   20   2.337 ± 0.048  us/op
Read.json_fastjson2_facade_jojo       PLUGIN_MODULE  avgt   20   2.232 ± 0.038  us/op !1.03x slower

Read.json_fastjson2_native_pojo                 N/A  avgt   20   0.768 ± 0.004  us/op baseline
Read.json_fastjson2_facade_pojo           SHARED_IO  avgt   20   1.565 ± 0.119  us/op
Read.json_fastjson2_facade_pojo        EXCLUSIVE_IO  avgt   20   1.211 ± 0.032  us/op
Read.json_fastjson2_facade_pojo       PLUGIN_MODULE  avgt   20   0.780 ± 0.006  us/op !1.02x slower

Read.json_jsonp_facade_jojo               SHARED_IO  avgt   20   4.694 ± 0.061  us/op
Read.json_jsonp_facade_pojo               SHARED_IO  avgt   20   3.275 ± 0.087  us/op

Read.json_simple_facade_jojo              SHARED_IO  avgt   20   8.372 ± 0.081  us/op
Read.json_simple_facade_pojo              SHARED_IO  avgt   20   7.635 ± 0.071  us/op
```

**Summary**

- **Jackson** — Default `PLUGIN_MODULE`, SJF4J achieves **near-parity performance** with native Jackson.  
  When using `EXCLUSIVE_IO`, SJF4J can be slightly faster with JOJO, but slower with POJO.


- **Gson** — Default `EXCLUSIVE_IO`, SJF4J performs **slightly faster** than the native Gson.   
  Gson’s native POJO binding does not support extra properties, while SJF4J does. 


- **Fastjson2** — Default `PLUGIN_MODULE`, SJF4J achieves **near-parity performance** with native Fastjson2.  
  Fastjson2 still has a noticeable advantage in POJO binding.


- **Overall performance** in our benchmarks roughly follows: Fastjson2 > Jackson > Gson > JSON-P (Parsson) > Simple (built-in)


> Note: Regardless of the underlying JSON parser, SJF4J ensures consistent behavior at the API level.

## Reflection Benchmark

SJF4J's OBNT relies on reflection for flexible access to POJO/JOJO/JAJO. Source: [ReflectionBenchmark.java](https://github.com/sjf4j-projects/sjf4j/blob/main/sjf4j/src/jmh/java/org/sjf4j/ReflectionBenchmark.java).

```text
Benchmark                                            Mode  Cnt   Score   Error  Units
ReflectionBenchmark.reflection_ctor_native           avgt   24   6.532 ± 0.512  ns/op baseline
ReflectionBenchmark.reflection_ctor_reflect          avgt   24  10.107 ± 0.059  ns/op
ReflectionBenchmark.reflection_ctor_methodHandle     avgt   24   9.156 ± 0.664  ns/op
ReflectionBenchmark.reflection_ctor_lambda           avgt   24   6.067 ± 0.064  ns/op !0.93 faster?

ReflectionBenchmark.reflection_getter_native         avgt   24   0.648 ± 0.018  ns/op baseline
ReflectionBenchmark.reflection_getter_reflect        avgt   24   4.184 ± 0.027  ns/op
ReflectionBenchmark.reflection_getter_methodHandle   avgt   24   3.104 ± 0.034  ns/op
ReflectionBenchmark.reflection_getter_lambda         avgt   24   0.796 ± 0.024  ns/op !1.23 slower

ReflectionBenchmark.reflection_setter_native         avgt   24   0.764 ± 0.023  ns/op baseline
ReflectionBenchmark.reflection_setter_reflect        avgt   24   4.376 ± 0.041  ns/op
ReflectionBenchmark.reflection_setter_methodHandle   avgt   24   3.040 ± 0.006  ns/op
ReflectionBenchmark.reflection_setter_lambda         avgt   24   0.996 ± 0.007  ns/op !1.30 slower
```

**Summary**:  
- SJF4J uses **lambda-based** accessors to minimize reflection overhead,
    enabling dynamic object manipulation with **near-native performance**.


## JSON Schema Validation Benchmark

According to the official JSON Schema [Bowtie](https://bowtie.report/) benchmark, 
performance can be evaluated locally using:
```shell
bowtie perf -i java-sjf4j -i java-json-schema -i java-networknt-json-schema-validator -D draft2020-12
```
Ran result:
```text
                                    Tests with Draft2020-12_MetaSchema                                     
                                                                                                           
 Test Name                java-sjf4j     java-json-schema            java-networknt-json-schema-validator  
────────────────────────────────────────────────────────────────────────────────────────────────────────── 
 Validating metaschema    35ms +- 2ms    74ms +- 5ms: 2.13x slower   74ms +- 3ms: 2.15x slower             
                          Reference      2.13x slower                2.15x slower                          
                                                                                                           
                                                                                                           
                                    Tests with OpenAPI_Spec_Schema                                         
                                                                                                           
 Test Name                  java-sjf4j     java-networknt-json-schema-validator   java-json-schema         
────────────────────────────────────────────────────────────────────────────────────────────────────────── 
 Non-OAuth Scopes Example   52ms +- 4ms    76ms +- 4ms: 1.46x slower              98ms +- 6ms: 1.87x slower
 Webhook Example            55ms +- 3ms    70ms +- 2ms: 1.28x slower              93ms +- 4ms: 1.7x slower 
                            Reference      1.37x slower                           1.78x slower             
                                                                                                           
                                    Tests with useless_keywords                                            
                                                                                                           
 Test Name             java-sjf4j       java-networknt-json-schema-validator   java-json-schema            
────────────────────────────────────────────────────────────────────────────────────────────────────────── 
 Beginning of schema   399ms +- 10ms    521ms +- 21ms: 1.31x slower            569ms +- 11ms: 1.43x slower 
 Middle of schema      390ms +- 5ms     520ms +- 12ms: 1.33x slower            564ms +- 6ms: 1.45x slower  
 End of schema         411ms +- 14ms    538ms +- 16ms: 1.31x slower            586ms +- 14ms: 1.42x slower 
 Valid                 396ms +- 10ms    525ms +- 19ms: 1.33x slower            585ms +- 15ms: 1.48x slower 
                       Reference        1.32x slower                           1.44x slower                
                                                                                                           
                                    Tests with nested_schemas                                              
                                                                                                           
 Test Name         java-sjf4j       java-json-schema            java-networknt-json-schema-validator       
────────────────────────────────────────────────────────────────────────────────────────────────────────── 
 No of Levels 1    31ms +- 850us    69ms +- 4ms: 2.25x slower   70ms +- 2ms: 2.26x slower                  
 No of Levels 4    29ms +- 2ms      72ms +- 3ms: 2.46x slower   73ms +- 3ms: 2.5x slower                   
 No of Levels 7    31ms +- 535us    71ms +- 3ms: 2.27x slower   74ms +- 2ms: 2.36x slower                  
 No of Levels 10   32ms +- 1ms      75ms +- 4ms: 2.37x slower   75ms +- 3ms: 2.36x slower                  
                   Reference        2.34x slower                2.37x slower                               
```
**Summary**:  
- In Bowtie’s draft 2020-12 benchmark, SJF4J delivers **high performance** 
  and consistently ranks among the top-tier of Java implementations.


