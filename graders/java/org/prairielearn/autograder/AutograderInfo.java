package org.prairielearn.autograder;

import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

@Retention(RetentionPolicy.RUNTIME)
public @interface AutograderInfo {
    double points() default 1;
    String name() default "";
    String description() default "";
}
