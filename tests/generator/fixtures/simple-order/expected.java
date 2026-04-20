package org.example.generated;

import jakarta.validation.constraints.NotNull;
import java.time.OffsetDateTime;
import lombok.Getter;
import lombok.Setter;
import org.sjf4j.JsonObject;

/**
 * Checkout order created by the storefront.
 *
 * JSON shape:
 * <pre>
 * {
 *   "id": "string",
 *   "amount": "number",
 *   "createdAt": "string(date-time)",
 *   "paid": "boolean"
 * }
 * </pre>
 */
@Getter @Setter
public class Order extends JsonObject {
    /** Business order identifier. */
    @NotNull
    private String id;

    /** Total amount in the settlement currency. */
    @NotNull
    private double amount;

    @NotNull
    private OffsetDateTime createdAt;

    private boolean paid;
}
