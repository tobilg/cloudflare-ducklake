import marimo

__generated_with = "0.11.31"
app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo
    return (mo,)


@app.cell
def _():
    import pandas
    import pyarrow as pa
    import pyarrow.compute as pc
    import pyarrow.parquet as pq

    from pyiceberg.catalog.rest import RestCatalog
    from pyiceberg.exceptions import NamespaceAlreadyExistsError

    # Define catalog connection details (replace variables)
    WAREHOUSE = "<WAREHOUSE>"
    TOKEN = "<TOKEN>"
    CATALOG_URI = "<CATALOG_URI>"

    # Connect to R2 Data Catalog
    catalog = RestCatalog(
        name="my_catalog",
        warehouse=WAREHOUSE,
        uri=CATALOG_URI,
        token=TOKEN,
    )
    return (
        CATALOG_URI,
        NamespaceAlreadyExistsError,
        RestCatalog,
        TOKEN,
        WAREHOUSE,
        catalog,
        pa,
        pandas,
        pc,
        pq,
    )


@app.cell
def _(NamespaceAlreadyExistsError, catalog):
    # Create default namespace if needed
    try:
        catalog.create_namespace("default")
    except NamespaceAlreadyExistsError:
        pass
    return


@app.cell
def _(pa):
    # Create simple PyArrow table
    df = pa.table({
        "id": [1, 2, 3],
        "name": ["Alice", "Bob", "Charlie"],
        "score": [80.0, 92.5, 88.0],
    })
    return (df,)


@app.cell
def _(catalog, df):
    # Create or load Iceberg table
    test_table = ("default", "people")
    if not catalog.table_exists(test_table):
        print(f"Creating table: {test_table}")
        table = catalog.create_table(
            test_table,
            schema=df.schema,
        )
    else:
        table = catalog.load_table(test_table)
    return table, test_table


@app.cell
def _(df, table):
    # Append data
    table.append(df)
    return


@app.cell
def _(table):
    print("Table contents:")
    scanned = table.scan().to_arrow()
    print(scanned.to_pandas())
    return (scanned,)


@app.cell
def _():
    # Optional cleanup. To run uncomment and run cell
    # print(f"Deleting table: {test_table}")
    # catalog.drop_table(test_table)
    # print("Table dropped.")
    return


if __name__ == "__main__":
    app.run()