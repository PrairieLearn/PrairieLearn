import java.lang.annotation.ElementType;

public @interface AutograderInfo {
    double points() default 1;
    String name() default "";
    String description() default "";
}
